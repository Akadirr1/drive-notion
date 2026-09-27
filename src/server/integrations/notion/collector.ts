import { eq } from "drizzle-orm";
import type { PageObjectResponse } from "@notionhq/client";
import type { ProjectConfig } from "@/server/config";
import type { WriterDb } from "@/server/db/client";
import { notionTasks, rawEvents, syncState } from "@/server/db/schema";
import { queryDataSource, retrieveDataSource } from "./client";
import { diffTask } from "./diff-task";
import {
  deriveStatusGroups,
  mapPage,
  validateSchema,
  type DataSourceSchema,
  type NotionTaskSnapshot,
} from "./map-page";

/**
 * Orchestrates a Notion synchronization cycle:
 * 1. Read sync_state to determine if this is the initial seed.
 * 2. Retrieve schema and validate against config.notion.properties.
 * 3. Derive status groups from schema (with config overrides applied per-page).
 * 4. Perform a full fetch of all pages (paginated, no filter).
 * 5. Map each page to a snapshot, diff against existing snapshot (if not seed),
 *    and transactionally write snapshots + raw events.
 * 6. Mark snapshots not seen in this complete fetch as archived = 1 (if not seed).
 * 7. Update sync_state with success timestamp (and set seeded = 1 if seed).
 * 8. Catch and record errors in sync_state without crashing or rethrowing.
 */
export async function syncNotion(
  db: WriterDb,
  config: ProjectConfig
): Promise<void> {
  let fetchComplete = false;

  try {
    // 1. Ensure sync_state row exists for 'notion' and read it
    db.insert(syncState)
      .values({ source: "notion" })
      .onConflictDoNothing()
      .run();

    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "notion"))
      .get();

    const isSeed = !state || state.seeded === 0;

    // 2. Retrieve schema
    const schema = (await retrieveDataSource(
      config.notion.tasks_data_source_id
    )) as unknown as DataSourceSchema;

    // 3. Validate schema against config
    validateSchema(schema, config);

    // 4. Derive baseline status groups from schema
    const schemaGroups = deriveStatusGroups(
      schema,
      config.notion.properties.status
    );

    // 5. Full fetch (paginate, no filter)
    const allPages: PageObjectResponse[] = [];
    let startCursor: string | undefined;

    do {
      const response = await queryDataSource(
        config.notion.tasks_data_source_id,
        {
          start_cursor: startCursor,
        }
      );

      for (const item of response.results) {
        if ("properties" in item) {
          allPages.push(item as PageObjectResponse);
        }
      }

      startCursor =
        response.has_more && response.next_cursor
          ? response.next_cursor
          : undefined;
    } while (startCursor);

    fetchComplete = true;

    // 6. Process pages
    const warn = (msg: object) => console.warn(JSON.stringify(msg));
    const seenPageIds = new Set<string>();

    for (const page of allPages) {
      const snapshot = mapPage(page, config, schemaGroups, warn);
      seenPageIds.add(snapshot.pageId);

      const existing = db
        .select()
        .from(notionTasks)
        .where(eq(notionTasks.pageId, snapshot.pageId))
        .get();

      // Diff: emit raw events only if not seeding
      const events = isSeed
        ? []
        : diffTask(existing ? (existing as NotionTaskSnapshot) : null, snapshot);

      // Transactionally upsert snapshot and insert raw events
      db.transaction((tx) => {
        if (existing) {
          tx.update(notionTasks)
            .set(snapshot)
            .where(eq(notionTasks.pageId, snapshot.pageId))
            .run();
        } else {
          tx.insert(notionTasks).values(snapshot).run();
        }

        for (const evt of events) {
          tx.insert(rawEvents)
            .values({
              source: "notion",
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
      });
    }

    // 7. Archival detection (ONLY if fetch was complete and not initial seed)
    if (fetchComplete && !isSeed) {
      const existingActiveTasks = db
        .select({ pageId: notionTasks.pageId })
        .from(notionTasks)
        .where(eq(notionTasks.archived, 0))
        .all();

      for (const task of existingActiveTasks) {
        if (!seenPageIds.has(task.pageId)) {
          db.update(notionTasks)
            .set({ archived: 1 })
            .where(eq(notionTasks.pageId, task.pageId))
            .run();
        }
      }
    }

    // 8. Update sync_state
    const now = new Date().toISOString();
    db.update(syncState)
      .set({
        seeded: 1,
        lastSuccessAt: now,
        lastError: null,
        lastErrorAt: null,
      })
      .where(eq(syncState.source, "notion"))
      .run();

    console.log(
      JSON.stringify({
        event: "sync_notion_complete",
        mode: isSeed ? "seed" : "incremental",
        pages: allPages.length,
        timestamp: now,
      })
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();

    db.insert(syncState)
      .values({ source: "notion" })
      .onConflictDoNothing()
      .run();

    db.update(syncState)
      .set({
        lastError: errorMessage,
        lastErrorAt: now,
      })
      .where(eq(syncState.source, "notion"))
      .run();

    console.error(
      JSON.stringify({
        event: "sync_notion_error",
        error: errorMessage,
        timestamp: now,
      })
    );
  }
}
