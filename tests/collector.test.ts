import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import {
  syncState,
  notionTasks,
  rawEvents,
  projectEvents,
} from "@/server/db/schema";
import { syncNotion } from "@/server/integrations/notion/collector";
import { normalizePending } from "@/server/events/process";
import {
  retrieveDataSource,
  queryDataSource,
} from "@/server/integrations/notion/client";
import type {
  GetDataSourceResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";
import {
  testProjectConfig,
  validDataSourceSchema,
  pageFixtures,
  buminProjectConfig,
  buminDataSourceSchema,
  buminPageFixtures,
} from "./fixtures/notion-pages";

// Mock Notion client methods
vi.mock("@/server/integrations/notion/client", () => ({
  retrieveDataSource: vi.fn(),
  queryDataSource: vi.fn(),
  getNotionClient: vi.fn(),
}));

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/server/db/migrations"),
  });
  // Initial sync_state rows as done by the worker
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

describe("syncNotion and normalizePending offline integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retrieveDataSource).mockResolvedValue(
      validDataSourceSchema as unknown as GetDataSourceResponse
    );
  });

  it("(1) the first sync seeds snapshots, sets seeded = 1, and writes no raw_events", async () => {
    const db = createTestDb();

    // Query returns two tasks
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage, pageFixtures.missingOptionalProps],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // 1. Check snapshots seeded
    const tasks = db.select().from(notionTasks).all();
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.pageId).sort()).toEqual(
      [pageFixtures.standardPage.id, pageFixtures.missingOptionalProps.id].sort()
    );

    // 2. Check sync_state
    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "notion"))
      .get();
    expect(state?.seeded).toBe(1);
    expect(state?.lastSuccessAt).not.toBeNull();
    expect(state?.lastError).toBeNull();

    // 3. Check NO raw_events or project_events written during seed
    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(0);
    const semantic = db.select().from(projectEvents).all();
    expect(semantic).toHaveLength(0);
  });

  it("(2) a second sync with one task moved to active writes a status:active raw event, and normalizePending turns it into TASK_STARTED", async () => {
    const db = createTestDb();

    // Initial seed with task in 'Yapılacak' (todo)
    const initialPage = {
      ...pageFixtures.standardPage,
      properties: {
        ...pageFixtures.standardPage.properties,
        Durum: {
          id: "p2",
          type: "status",
          status: { id: "opt-todo-1", name: "Yapılacak" },
        },
      },
    };

    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [initialPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // Verify seed complete
    expect(db.select().from(rawEvents).all()).toHaveLength(0);

    // Second sync: task moved to 'Devam ediyor' (active)
    const updatedPage = {
      ...pageFixtures.standardPage,
      last_edited_time: "2026-09-27T11:00:00.000Z",
      properties: {
        ...pageFixtures.standardPage.properties,
        Durum: {
          id: "p2",
          type: "status",
          status: { id: "opt-active-1", name: "Devam ediyor" },
        },
      },
    };

    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [updatedPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // Verify raw_events contains status:active
    const raw = db.select().from(rawEvents).all();
    expect(raw).toHaveLength(1);
    expect(raw[0].kind).toBe("status:active");
    expect(raw[0].processed).toBe(0);

    // Process pending raw events
    normalizePending(db);

    // Verify raw_events is marked processed
    const updatedRaw = db.select().from(rawEvents).all();
    expect(updatedRaw[0].processed).toBe(1);

    // Verify project_events has TASK_STARTED
    const events = db.select().from(projectEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("TASK_STARTED");
    expect(events[0].subjectTitle).toBe("Assemble avionics harness");
    expect(events[0].departmentId).toBe("01");
    expect(events[0].source).toBe("notion");
  });

  it("(3) a page missing from a complete fetch gets archived = 1 with no event", async () => {
    const db = createTestDb();

    // First sync (seed) with two pages
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage, pageFixtures.missingOptionalProps],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // Both pages active (archived = 0)
    const initialTasks = db.select().from(notionTasks).all();
    expect(initialTasks).toHaveLength(2);
    expect(initialTasks.every((t) => t.archived === 0)).toBe(true);

    // Second sync: missingOptionalProps is now missing (e.g. trashed in Notion)
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // Verify missingOptionalProps is now archived = 1
    const archivedTask = db
      .select()
      .from(notionTasks)
      .where(eq(notionTasks.pageId, pageFixtures.missingOptionalProps.id))
      .get();
    expect(archivedTask?.archived).toBe(1);

    // standardPage is still archived = 0
    const activeTask = db
      .select()
      .from(notionTasks)
      .where(eq(notionTasks.pageId, pageFixtures.standardPage.id))
      .get();
    expect(activeTask?.archived).toBe(0);

    // NO event emitted for archiving
    expect(db.select().from(rawEvents).all()).toHaveLength(0);
    expect(db.select().from(projectEvents).all()).toHaveLength(0);
  });

  it("(4) a query that throws on the second page archives nothing, records last_error, and does not throw out of syncNotion", async () => {
    const db = createTestDb();

    // First sync (seed) with two pages
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage, pageFixtures.missingOptionalProps],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    // Second sync: first page fetch succeeds, second page throws
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({
        results: [pageFixtures.standardPage],
        has_more: true,
        next_cursor: "cursor-page-2",
      } as unknown as QueryDataSourceResponse)
      .mockRejectedValueOnce(new Error("Network timeout or 500 error"));

    // syncNotion must NOT throw
    await expect(syncNotion(db, testProjectConfig)).resolves.not.toThrow();

    // Verify last_error recorded in sync_state
    const state = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "notion"))
      .get();
    expect(state?.lastError).toContain("Network timeout or 500 error");
    expect(state?.lastErrorAt).not.toBeNull();

    // Verify NOTHING was archived because fetch was incomplete
    const tasks = db.select().from(notionTasks).all();
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.archived === 0)).toBe(true);
  });

  it("(5) an unchanged second sync writes nothing new", async () => {
    const db = createTestDb();

    // First sync (seed)
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);

    expect(db.select().from(rawEvents).all()).toHaveLength(0);

    // Second sync with identical data
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [pageFixtures.standardPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, testProjectConfig);
    normalizePending(db);

    // No raw events and no project events written
    expect(db.select().from(rawEvents).all()).toHaveLength(0);
    expect(db.select().from(projectEvents).all()).toHaveLength(0);

    // Snapshot is unchanged
    const tasks = db.select().from(notionTasks).all();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Assemble avionics harness");
  });

  it("(6) queryDataSource is called with the row filter on every page", async () => {
    const db = createTestDb();

    vi.mocked(retrieveDataSource).mockResolvedValueOnce(
      buminDataSourceSchema as unknown as GetDataSourceResponse
    );

    // Page 1: returns blokePage, has_more: true
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({
        results: [buminPageFixtures.blokePage],
        has_more: true,
        next_cursor: "page-2-cursor",
      } as unknown as QueryDataSourceResponse)
      // Page 2: returns aktifPage, has_more: false
      .mockResolvedValueOnce({
        results: [buminPageFixtures.aktifPage],
        has_more: false,
        next_cursor: null,
      } as unknown as QueryDataSourceResponse);

    await syncNotion(db, buminProjectConfig);

    expect(queryDataSource).toHaveBeenCalledTimes(2);

    // Verify row filter is passed on every page
    const expectedFilter = {
      property: "Grup",
      select: {
        equals: "Görev",
      },
    };

    expect(queryDataSource).toHaveBeenNthCalledWith(
      1,
      buminProjectConfig.notion.tasks_data_source_id,
      {
        start_cursor: undefined,
        filter: expectedFilter,
      }
    );

    expect(queryDataSource).toHaveBeenNthCalledWith(
      2,
      buminProjectConfig.notion.tasks_data_source_id,
      {
        start_cursor: "page-2-cursor",
        filter: expectedFilter,
      }
    );

    const tasks = db.select().from(notionTasks).all();
    expect(tasks).toHaveLength(2);
    const blokeTask = tasks.find((t) => t.pageId === buminPageFixtures.blokePage.id);
    expect(blokeTask?.blocked).toBe(1);
    expect(blokeTask?.priorityRank).toBe(0);
    expect(blokeTask?.sortOrder).toBe(1);
  });

  it("(7) a row that leaves the row filter is no longer returned and gets archived by the existing full-fetch rule", async () => {
    const db = createTestDb();

    vi.mocked(retrieveDataSource).mockResolvedValue(
      buminDataSourceSchema as unknown as GetDataSourceResponse
    );

    // Seed sync returns two tasks matching row filter
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [buminPageFixtures.blokePage, buminPageFixtures.aktifPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, buminProjectConfig);

    expect(db.select().from(notionTasks).where(eq(notionTasks.archived, 0)).all()).toHaveLength(2);

    // Second sync: blokePage was converted to a Work Package in Notion, so it left the filter.
    // The query returns only aktifPage.
    vi.mocked(queryDataSource).mockResolvedValueOnce({
      results: [buminPageFixtures.aktifPage],
      has_more: false,
      next_cursor: null,
    } as unknown as QueryDataSourceResponse);

    await syncNotion(db, buminProjectConfig);

    // blokePage is now marked archived = 1
    const blokeInDb = db
      .select()
      .from(notionTasks)
      .where(eq(notionTasks.pageId, buminPageFixtures.blokePage.id))
      .get();
    expect(blokeInDb?.archived).toBe(1);

    // aktifPage is still archived = 0
    const aktifInDb = db
      .select()
      .from(notionTasks)
      .where(eq(notionTasks.pageId, buminPageFixtures.aktifPage.id))
      .get();
    expect(aktifInDb?.archived).toBe(0);
  });
});
