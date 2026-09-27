import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import {
  syncState,
  driveFiles,
  rawEvents,
  projectEvents,
} from "@/server/db/schema";
import { syncDrive } from "@/server/integrations/drive/collector";
import { normalizePending } from "@/server/events/process";
import {
  getDriveClient,
  listChildren,
} from "@/server/integrations/drive/client";
import { mockDriveConfig } from "./fixtures/drive-files";

// Mock Drive client functions
vi.mock("@/server/integrations/drive/client", () => ({
  getDriveClient: vi.fn(),
  listChildren: vi.fn(),
}));

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/server/db/migrations"),
  });
  db.insert(syncState)
    .values([
      { source: "notion" },
      { source: "drive" },
      { source: "worker" },
    ])
    .onConflictDoNothing()
    .run();
  return db;
}

describe("syncDrive and normalizePending offline integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDriveClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
  });

  it("(1) seed sync creates snapshots, sets seeded = 1, and writes no raw events", async () => {
    const db = createTestDb();

    // Mock tree: root contains folder-01; folder-01 contains file-001
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
                createdTime: "2026-09-01T10:00:00.000Z",
                modifiedTime: "2026-09-01T10:00:00.000Z",
              },
            ],
            nextPageToken: null,
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Hover_TEST_raporu_v1.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-10T10:00:00.000Z",
                modifiedTime: "2026-09-10T10:00:00.000Z",
                webViewLink: "https://drive.google.com/file/d/file-001/view",
              },
            ],
            nextPageToken: null,
          };
        }
        return { files: [], nextPageToken: null };
      }
    );

    await syncDrive(db, mockDriveConfig);

    const files = db.select().from(driveFiles).all();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.fileId).sort()).toEqual(["file-001", "folder-01"]);

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(0);

    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(0);

    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "drive"))
      .get();
    expect(state?.seeded).toBe(1);
    expect(state?.lastSuccessAt).not.toBeNull();
    expect(state?.lastError).toBeNull();
  });

  it("(2) new file in second sync emits doc:created with right WP, and normalizePending turns it into DOC_CREATED", async () => {
    const db = createTestDb();

    // 1. Seed with folder-01 and file-001
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Hover_TEST_raporu_v1.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-10T10:00:00.000Z",
                modifiedTime: "2026-09-10T10:00:00.000Z",
              },
            ],
          };
        }
        return { files: [] };
      }
    );
    await syncDrive(db, mockDriveConfig);

    // 2. Second sync adds file-002 to folder-01
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Hover_TEST_raporu_v1.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-10T10:00:00.000Z",
                modifiedTime: "2026-09-10T10:00:00.000Z",
              },
              {
                id: "file-002",
                name: "Sensor_EKF_report.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-11T12:00:00.000Z",
                modifiedTime: "2026-09-11T12:00:00.000Z",
                webViewLink: "https://drive.google.com/file/d/file-002/view",
              },
            ],
          };
        }
        return { files: [] };
      }
    );

    await syncDrive(db, mockDriveConfig);

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(1);
    expect(raw[0].kind).toBe("doc:created");
    expect(raw[0].externalId).toBe("file-002");
    expect(raw[0].occurredAt).toBe("2026-09-11T12:00:00.000Z");

    normalizePending(db);

    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].type).toBe("DOC_CREATED");
    expect(project[0].departmentId).toBe("01");
    expect(project[0].subjectTitle).toBe("Sensor_EKF_report.pdf");
    expect(project[0].docType).toBe("report");
    expect(project[0].source).toBe("drive");
  });

  it("(3) modified file in second sync emits doc:updated and normalizePending turns it into DOC_UPDATED", async () => {
    const db = createTestDb();

    // 1. Seed
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Hover_TEST_raporu_v1.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-10T10:00:00.000Z",
                modifiedTime: "2026-09-10T10:00:00.000Z",
                webViewLink: "https://drive.google.com/view/1",
              },
            ],
          };
        }
        return { files: [] };
      }
    );
    await syncDrive(db, mockDriveConfig);

    // 2. Second sync: modifiedTime changed 2 hours later
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Hover_TEST_raporu_v1.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
                createdTime: "2026-09-10T10:00:00.000Z",
                modifiedTime: "2026-09-10T12:00:00.000Z",
                webViewLink: "https://drive.google.com/view/1",
              },
            ],
          };
        }
        return { files: [] };
      }
    );

    await syncDrive(db, mockDriveConfig);

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(1);
    expect(raw[0].kind).toBe("doc:updated");
    expect(raw[0].occurredAt).toBe("2026-09-10T12:00:00.000Z");

    normalizePending(db);

    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].type).toBe("DOC_UPDATED");
    expect(project[0].subjectTitle).toBe("Hover_TEST_raporu_v1.pdf");
    expect(project[0].occurredAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("(4) three saves within 30 minutes → one project event whose occurred_at and raw_event_id point to the last save", async () => {
    const db = createTestDb();

    // 1. Seed at 10:00
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Test_Raporu.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    // Save 1 at 10:05
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Test_Raporu.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:05:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);
    normalizePending(db);

    let project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].occurredAt).toBe("2026-09-10T10:05:00.000Z");

    // Save 2 at 10:15
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Test_Raporu.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:15:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);
    normalizePending(db);

    project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].occurredAt).toBe("2026-09-10T10:15:00.000Z");

    // Save 3 at 10:25
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Test_Raporu.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:25:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);
    normalizePending(db);

    // Exactly one project event row preserved!
    project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].occurredAt).toBe("2026-09-10T10:25:00.000Z");

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(3);
    const lastRaw = raw[raw.length - 1];
    expect(project[0].rawEventId).toBe(lastRaw.id);
  });

  it("(4b) coalescing sets occurred_at to the later of existing and new time, never earlier", () => {
    const db = createTestDb();

    // Insert an existing project event at 10:20
    db.insert(projectEvents)
      .values({
        id: 1,
        type: "DOC_UPDATED",
        departmentId: "01",
        subjectTitle: "Report_v1.pdf",
        detail: null,
        docType: "report",
        source: "drive",
        sourceId: "file-001",
        url: "https://drive.google.com/view/1",
        occurredAt: "2026-09-10T10:20:00.000Z",
        rawEventId: 10,
      })
      .run();

    // Insert an unprocessed raw event occurring at 10:05 (within 30m window, but earlier than existing)
    db.insert(rawEvents)
      .values({
        source: "drive",
        kind: "doc:updated",
        externalId: "file-001",
        payload: JSON.stringify({
          before: { name: "Report_old.pdf", departmentId: "01", docType: "report", webViewLink: "" },
          after: { name: "Report_v2.pdf", departmentId: "01", docType: "report", webViewLink: "https://drive.google.com/view/1" },
        }),
        occurredAt: "2026-09-10T10:05:00.000Z",
        ingestedAt: "2026-09-10T10:21:00.000Z",
        processed: 0,
      })
      .run();

    normalizePending(db);

    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    // occurredAt must remain 10:20 (the later time, never set earlier)
    expect(project[0].occurredAt).toBe("2026-09-10T10:20:00.000Z");
    expect(project[0].subjectTitle).toBe("Report_v2.pdf");
  });

  it("(5) file missing from complete crawl → trashed = 1, no event", async () => {
    const db = createTestDb();

    // 1. Seed with two files
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Doc_1.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
        {
          id: "file-002",
          name: "Doc_2.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    // 2. Second complete crawl only returns file-001
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Doc_1.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    const doc2 = db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.fileId, "file-002"))
      .get();
    expect(doc2?.trashed).toBe(1);

    const doc1 = db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.fileId, "file-001"))
      .get();
    expect(doc1?.trashed).toBe(0);

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(0);
  });

  it("(6) file moved between WP folders → department changes, no event", async () => {
    const db = createTestDb();

    // 1. Seed with file-001 in folder-01
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Plan.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    const before = db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.fileId, "file-001"))
      .get();
    expect(before?.departmentId).toBe("01");

    // 2. Move file to folder-02 (name and modifiedTime unchanged)
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "file-001",
          name: "Plan.pdf",
          mimeType: "application/pdf",
          parents: ["folder-02"],
          createdTime: "2026-09-10T10:00:00.000Z",
          modifiedTime: "2026-09-10T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    const after = db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.fileId, "file-001"))
      .get();
    expect(after?.departmentId).toBe("02");

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(0);
  });

  it("(7) crawl fails on a later folder → nothing trashed, last_error recorded, no throw, asserts no new drive_files rows or raw_events were written", async () => {
    const db = createTestDb();

    // 1. Seed with folder-01 and file-001
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
              {
                id: "folder-02",
                name: "02 Haberleşme",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Report.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
              },
            ],
          };
        }
        return { files: [] };
      }
    );
    await syncDrive(db, mockDriveConfig);

    const filesBefore = db.select().from(driveFiles).all();
    const rawBefore = db.select().from(rawEvents).all();

    // 2. Second crawl: root succeeds, folder-01 returns a new file-002, but folder-02 throws an API error!
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string) => {
        if (folderId === "root-folder-id") {
          return {
            files: [
              {
                id: "folder-01",
                name: "01 Avionik",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
              {
                id: "folder-02",
                name: "02 Haberleşme",
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root-folder-id"],
              },
            ],
          };
        }
        if (folderId === "folder-01") {
          return {
            files: [
              {
                id: "file-001",
                name: "Report.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
              },
              {
                id: "file-002",
                name: "New_Report.pdf",
                mimeType: "application/pdf",
                parents: ["folder-01"],
              },
            ],
          };
        }
        if (folderId === "folder-02") {
          throw new Error("Network 503 Service Unavailable");
        }
        return { files: [] };
      }
    );

    await expect(syncDrive(db, mockDriveConfig)).resolves.not.toThrow();

    // Verify error was recorded
    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "drive"))
      .get();
    expect(state?.lastError).toBe("Network 503 Service Unavailable");

    // Assert crawl-first write-after: NO new rows or raw events written
    const filesAfter = db.select().from(driveFiles).all();
    expect(filesAfter).toHaveLength(filesBefore.length);
    expect(filesAfter.find((f) => f.fileId === "file-002")).toBeUndefined();

    const rawAfter = db.select().from(rawEvents).all();
    expect(rawAfter).toHaveLength(rawBefore.length);

    // Assert nothing was trashed
    expect(filesAfter.every((f) => f.trashed === 0)).toBe(true);
  });

  it("(8) silent file (image or .ulg) → stored, no event", async () => {
    const db = createTestDb();

    // 1. Seed
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [],
    });
    await syncDrive(db, mockDriveConfig);

    // 2. Second sync introduces image and .ulg file
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "img-001",
          name: "flight.png",
          mimeType: "image/png",
          parents: ["folder-01"],
        },
        {
          id: "ulg-001",
          name: "flight-10.ulg",
          mimeType: "application/octet-stream",
          parents: ["folder-01"],
        },
      ],
    });

    await syncDrive(db, mockDriveConfig);

    const files = db.select().from(driveFiles).all();
    expect(files).toHaveLength(2);

    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(0);
  });

  it("(9) handoff file outside WP folders → department extracted from its WP-xx code", async () => {
    const db = createTestDb();

    // 1. Seed
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [],
    });
    await syncDrive(db, mockDriveConfig);

    // 2. File in root folder with WP-03 in name
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "ho-001",
          name: "HO-01_WP-03_camera_handoff.pdf",
          mimeType: "application/pdf",
          parents: ["root-folder-id"],
          createdTime: "2026-09-12T10:00:00.000Z",
          modifiedTime: "2026-09-12T10:00:00.000Z",
        },
      ],
    });

    await syncDrive(db, mockDriveConfig);

    const file = db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.fileId, "ho-001"))
      .get();
    expect(file?.departmentId).toBe("03");

    normalizePending(db);

    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].departmentId).toBe("03");
    expect(project[0].subjectTitle).toBe("HO-01_WP-03_camera_handoff.pdf");
  });

  it("(10) invalid credentials → mocks client to throw that error, last_error set, loop continues safely", async () => {
    const db = createTestDb();

    (getDriveClient as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 environment variable is not set. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 in your environment or .env file."
      );
    });

    await expect(syncDrive(db, mockDriveConfig)).resolves.not.toThrow();

    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "drive"))
      .get();
    expect(state?.lastError).toContain("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  });

  it("(11) file created as 'Adsız doküman' and renamed within 30 minutes → exactly one DOC_CREATED project event with final name", async () => {
    const db = createTestDb();

    // 1. Seed
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [],
    });
    await syncDrive(db, mockDriveConfig);

    // 2. Created at 12:00:00Z with initial name "Adsız doküman.gdoc"
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "doc-rename-01",
          name: "Adsız doküman.gdoc",
          mimeType: "application/vnd.google-apps.document",
          parents: ["folder-01"],
          createdTime: "2026-09-10T12:00:00.000Z",
          modifiedTime: "2026-09-10T12:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);
    normalizePending(db);

    let project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].type).toBe("DOC_CREATED");
    expect(project[0].subjectTitle).toBe("Adsız doküman.gdoc");

    // 3. Renamed 15 minutes later at 12:15:00Z to "Hover_Test_Plan_WP-01.pdf"
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "doc-rename-01",
          name: "Hover_Test_Plan_WP-01.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-09-10T12:00:00.000Z",
          modifiedTime: "2026-09-10T12:15:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);
    normalizePending(db);

    // Exactly one project event, still DOC_CREATED, with the final name!
    project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].type).toBe("DOC_CREATED");
    expect(project[0].subjectTitle).toBe("Hover_Test_Plan_WP-01.pdf");
    expect(project[0].occurredAt).toBe("2026-09-10T12:15:00.000Z");
  });

  it("(12) file renamed with modifiedTime unchanged uses crawlTime as occurredAt and avoids unique key collision", async () => {
    const db = createTestDb();

    // 1. Seed
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "doc-rename-02",
          name: "Original_Name.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-08-01T10:00:00.000Z",
          modifiedTime: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    // 2. Renamed, but modifiedTime remains 2026-08-01T10:00:00.000Z
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "doc-rename-02",
          name: "Renamed_Once.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-08-01T10:00:00.000Z",
          modifiedTime: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    const raw1 = db.select().from(rawEvents).all();
    expect(raw1).toHaveLength(1);
    expect(raw1[0].kind).toBe("doc:updated");
    // occurredAt must NOT be the old 2026-08-01 modifiedTime; it must be the crawl time (recent)
    expect(raw1[0].occurredAt).not.toBe("2026-08-01T10:00:00.000Z");
    const occurredAtFirstRename = raw1[0].occurredAt;

    // Small delay to ensure next crawl gets distinct ISO timestamp
    await new Promise((r) => setTimeout(r, 10));

    // 3. Renamed again in a subsequent crawl, still with unchanged modifiedTime
    (listChildren as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      files: [
        {
          id: "doc-rename-02",
          name: "Renamed_Twice.pdf",
          mimeType: "application/pdf",
          parents: ["folder-01"],
          createdTime: "2026-08-01T10:00:00.000Z",
          modifiedTime: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    await syncDrive(db, mockDriveConfig);

    const raw2 = db.select().from(rawEvents).all();
    expect(raw2).toHaveLength(2);
    expect(raw2[1].occurredAt).not.toBe(occurredAtFirstRename);

    normalizePending(db);
    const project = db.select().from(projectEvents).all();
    expect(project).toHaveLength(1);
    expect(project[0].subjectTitle).toBe("Renamed_Twice.pdf");
  });
});

