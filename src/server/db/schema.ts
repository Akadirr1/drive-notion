import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";

export const syncState = sqliteTable("sync_state", {
  source: text("source").primaryKey(),
  cursor: text("cursor"),
  seeded: integer("seeded").notNull().default(0),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  lastErrorAt: text("last_error_at"),
});

export const notionTasks = sqliteTable("notion_tasks", {
  pageId: text("page_id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  statusGroup: text("status_group").notNull(),
  departmentId: text("department_id"),
  milestoneId: text("milestone_id"),
  dueDate: text("due_date"),
  blocked: integer("blocked").notNull().default(0),
  blockerNote: text("blocker_note"),
  isNext: integer("is_next").notNull().default(0),
  priorityRank: integer("priority_rank"),
  sortOrder: real("sort_order"),
  url: text("url").notNull(),
  archived: integer("archived").notNull().default(0),
  lastEditedTime: text("last_edited_time").notNull(),
});

export const driveFiles = sqliteTable("drive_files", {
  fileId: text("file_id").primaryKey(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  isFolder: integer("is_folder").notNull().default(0),
  parentId: text("parent_id"),
  departmentId: text("department_id"),
  docType: text("doc_type"),
  createdTime: text("created_time").notNull(),
  modifiedTime: text("modified_time").notNull(),
  webViewLink: text("web_view_link").notNull(),
  trashed: integer("trashed").notNull().default(0),
});

export const rawEvents = sqliteTable(
  "raw_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    externalId: text("external_id").notNull(),
    payload: text("payload").notNull(),
    occurredAt: text("occurred_at").notNull(),
    ingestedAt: text("ingested_at").notNull(),
    processed: integer("processed").notNull().default(0),
  },
  (table) => [
    unique().on(table.source, table.externalId, table.kind, table.occurredAt),
  ],
);

export const projectEvents = sqliteTable("project_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  departmentId: text("department_id"),
  subjectTitle: text("subject_title").notNull(),
  detail: text("detail"),
  docType: text("doc_type"),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  url: text("url"),
  occurredAt: text("occurred_at").notNull(),
  rawEventId: integer("raw_event_id"),
});
