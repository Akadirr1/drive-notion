import { eq } from "drizzle-orm";
import type { ProjectConfig } from "@/server/config";
import type { WriterDb } from "@/server/db/client";
import { driveFiles, rawEvents, syncState } from "@/server/db/schema";
import { getDriveClient, listChildren, type DriveFileItem } from "./client";
import {
  diffFile,
  isSilentFile,
  mapFile,
  type DriveFileSnapshot,
} from "./map-file";

/**
 * Orchestrates a Google Drive synchronization cycle with crawl-first, write-after semantics:
 * 1. Read sync_state to determine if this is the initial seed.
 * 2. In-memory crawl: BFS traversal starting from config.drive.root_folder_id.
 *    Collects all files and folders into memory.
 *    If crawl encounters any error: records error in sync_state.last_error and returns gracefully.
 *    No file snapshots or raw events are written on failure.
 * 3. Only after the crawl finishes completely:
 *    - Map each item to a snapshot, diff against existing snapshot (if not seed).
 *    - Transactionally write snapshots + raw events.
 *    - Mark files missing from this complete crawl as trashed = 1 (if not seed).
 *    - Update sync_state with lastSuccessAt (and seeded = 1).
 */
export async function syncDrive(
  db: WriterDb,
  config: ProjectConfig
): Promise<void> {
  try {
    // 1. Ensure Drive client can be created (validates credentials)
    getDriveClient();

    // 2. Read sync_state to check seed status
    db.insert(syncState)
      .values({ source: "drive" })
      .onConflictDoNothing()
      .run();

    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "drive"))
      .get();

    const isSeed = !state || state.seeded === 0;

    // 3. BFS crawl - in-memory collection
    const crawlTime = new Date().toISOString();
    const queue: string[] = [config.drive.root_folder_id];
    const visitedFolders = new Set<string>();
    const allItems: DriveFileItem[] = [];
    const parentMap = new Map<string, string | null>();

    while (queue.length > 0) {
      const currentFolderId = queue.shift()!;
      if (visitedFolders.has(currentFolderId)) {
        continue;
      }
      visitedFolders.add(currentFolderId);

      let pageToken: string | undefined = undefined;
      do {
        const res = await listChildren(currentFolderId, pageToken);

        for (const item of res.files) {
          // Skip Drive shortcuts
          if (item.mimeType === "application/vnd.google-apps.shortcut") {
            continue;
          }

          parentMap.set(item.id, currentFolderId);
          allItems.push(item);

          if (item.mimeType === "application/vnd.google-apps.folder") {
            if (!visitedFolders.has(item.id)) {
              queue.push(item.id);
            }
          }
        }

        pageToken = res.nextPageToken ?? undefined;
      } while (pageToken);
    }

    // 4. Crawl succeeded completely. Now process and write everything in a single transaction.
    const departmentFolderMap = new Map<string, string>();
    for (const d of config.departments) {
      departmentFolderMap.set(d.drive_folder_id, d.id);
    }

    const existingRows = db.select().from(driveFiles).all();
    const existingMap = new Map<string, DriveFileSnapshot>(
      existingRows.map((r) => [r.fileId, r as DriveFileSnapshot])
    );

    const seenFileIds = new Set<string>();

    db.transaction((tx) => {
      // 4a. Process and upsert crawled files
      for (const item of allItems) {
        seenFileIds.add(item.id);

        const snapshot = mapFile(item, parentMap, departmentFolderMap, config);
        const silent = isSilentFile(item, config);
        const existing = existingMap.get(item.id) ?? null;

        const events = isSeed ? [] : diffFile(existing, snapshot, silent, crawlTime);

        tx.insert(driveFiles)
          .values(snapshot)
          .onConflictDoUpdate({
            target: driveFiles.fileId,
            set: {
              name: snapshot.name,
              mimeType: snapshot.mimeType,
              isFolder: snapshot.isFolder,
              parentId: snapshot.parentId,
              departmentId: snapshot.departmentId,
              docType: snapshot.docType,
              createdTime: snapshot.createdTime,
              modifiedTime: snapshot.modifiedTime,
              webViewLink: snapshot.webViewLink,
              trashed: 0,
            },
          })
          .run();

        for (const evt of events) {
          tx.insert(rawEvents)
            .values({
              source: "drive",
              kind: evt.kind,
              externalId: evt.externalId,
              payload: evt.payload,
              occurredAt: evt.occurredAt,
              ingestedAt: new Date().toISOString(),
              processed: 0,
            })
            .onConflictDoNothing()
            .run();
        }
      }

      // 4b. Trashing: mark files not seen in this complete crawl as trashed = 1 (if not seed)
      if (!isSeed) {
        for (const existing of existingRows) {
          if (!seenFileIds.has(existing.fileId) && existing.trashed === 0) {
            tx.update(driveFiles)
              .set({ trashed: 1 })
              .where(eq(driveFiles.fileId, existing.fileId))
              .run();
          }
        }
      }

      // 4c. Update sync_state with success
      const now = new Date().toISOString();
      tx.update(syncState)
        .set({
          seeded: 1,
          lastSuccessAt: now,
          lastError: null,
          lastErrorAt: null,
        })
        .where(eq(syncState.source, "drive"))
        .run();
    });

    console.log(
      JSON.stringify({
        event: "sync_drive_complete",
        mode: isSeed ? "seed" : "sync",
        files: allItems.length,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();

    db.insert(syncState)
      .values({ source: "drive" })
      .onConflictDoNothing()
      .run();

    db.update(syncState)
      .set({
        lastError: errorMessage,
        lastErrorAt: now,
      })
      .where(eq(syncState.source, "drive"))
      .run();

    console.error(
      JSON.stringify({
        event: "sync_drive_error",
        error: errorMessage,
        timestamp: now,
      })
    );
  }
}
