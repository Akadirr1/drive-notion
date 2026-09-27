import type { PageObjectResponse } from "@notionhq/client";
import type { ProjectConfig } from "@/server/config";

export class PropertyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropertyConfigError";
  }
}

export interface DataSourceSchema {
  properties: Record<
    string,
    {
      id?: string;
      name?: string;
      type: string;
      status?: {
        options?: Array<{ id: string; name: string; color?: string; description?: string | null }>;
        groups?: Array<{ id: string; name: string; option_ids: string[] }>;
      };
      [key: string]: unknown;
    }
  >;
  [key: string]: unknown;
}

/** The snapshot shape that maps to notion_tasks columns. */
export interface NotionTaskSnapshot {
  pageId: string;
  title: string;
  status: string;
  statusGroup: "todo" | "active" | "done";
  departmentId: string | null;
  milestoneId: string | null;
  dueDate: string | null;
  blocked: number; // 0 or 1
  blockerNote: string | null;
  isNext: number; // 0 or 1
  url: string;
  archived: number; // 0 or 1
  lastEditedTime: string;
}

/**
 * Validates the data source schema against config.notion.properties.
 * Throws PropertyConfigError naming the property, expected type, and config/project.yaml.
 */
export function validateSchema(
  schema: DataSourceSchema,
  config: ProjectConfig
): void {
  const availableKeys = Object.keys(schema.properties || {});
  const availableList = availableKeys.join(", ");

  function findProp(name: string) {
    if (schema.properties && schema.properties[name]) {
      return schema.properties[name];
    }
    return Object.values(schema.properties || {}).find((p) => p.name === name);
  }

  function checkProp(
    configKey: string,
    propertyName: string,
    expectedType: string,
    required: boolean
  ) {
    const prop = findProp(propertyName);
    if (!prop) {
      if (required) {
        throw new PropertyConfigError(
          `Notion property "${propertyName}" (configured as notion.properties.${configKey} in config/project.yaml) not found in schema. Available properties: [${availableList}]`
        );
      }
      return;
    }

    if (prop.type !== expectedType) {
      throw new PropertyConfigError(
        `Notion property "${propertyName}" (configured as notion.properties.${configKey} in config/project.yaml) expected type "${expectedType}" but found "${prop.type}". Available properties: [${availableList}]`
      );
    }
  }

  // Required properties
  checkProp("title", config.notion.properties.title, "title", true);
  checkProp("status", config.notion.properties.status, "status", true);
  checkProp("department", config.notion.properties.department, "select", true);

  // Optional properties
  if (config.notion.properties.due) {
    checkProp("due", config.notion.properties.due, "date", false);
  }
  if (config.notion.properties.blocked) {
    checkProp("blocked", config.notion.properties.blocked, "checkbox", false);
  }
  if (config.notion.properties.blocker_note) {
    checkProp(
      "blocker_note",
      config.notion.properties.blocker_note,
      "rich_text",
      false
    );
  }
  if (config.notion.properties.milestone) {
    checkProp("milestone", config.notion.properties.milestone, "select", false);
  }
  if (config.notion.properties.next) {
    checkProp("next", config.notion.properties.next, "checkbox", false);
  }
}

/**
 * Derives status_group mapping from the data source schema's status property groups.
 * Uses position: 1st group → todo, 2nd → active, 3rd → done.
 * Returns a Map<statusOptionName, 'todo' | 'active' | 'done'>.
 */
export function deriveStatusGroups(
  schema: DataSourceSchema,
  statusPropertyName: string
): Map<string, "todo" | "active" | "done"> {
  const result = new Map<string, "todo" | "active" | "done">();
  const prop =
    schema.properties?.[statusPropertyName] ??
    Object.values(schema.properties || {}).find(
      (p) => p.name === statusPropertyName
    );

  if (!prop || prop.type !== "status" || !prop.status) {
    return result;
  }

  const groups = prop.status.groups || [];
  const options = prop.status.options || [];

  const todoGroupIds = new Set(groups[0]?.option_ids || []);
  const activeGroupIds = new Set(groups[1]?.option_ids || []);
  const doneGroupIds = new Set(groups[2]?.option_ids || []);

  for (const opt of options) {
    if (todoGroupIds.has(opt.id)) {
      result.set(opt.name, "todo");
    } else if (activeGroupIds.has(opt.id)) {
      result.set(opt.name, "active");
    } else if (doneGroupIds.has(opt.id)) {
      result.set(opt.name, "done");
    } else {
      result.set(opt.name, "todo");
    }
  }

  return result;
}

/**
 * Resolves a status value's group according to Amendment B:
 * - Always derives baseline groups from the schema.
 * - If config.notion.status_groups is set, it overrides only the options it lists.
 * - A status value not listed in config overrides falls back to its schema-derived group with a warning.
 * - Never falls silently to "todo".
 */
export function resolveStatusGroup(
  statusName: string,
  schemaGroups: Map<string, "todo" | "active" | "done">,
  configStatusGroups:
    | { todo?: string[]; active?: string[]; done?: string[] }
    | undefined,
  warn: (msg: object) => void
): "todo" | "active" | "done" {
  if (configStatusGroups) {
    if (configStatusGroups.todo?.includes(statusName)) {
      return "todo";
    }
    if (configStatusGroups.active?.includes(statusName)) {
      return "active";
    }
    if (configStatusGroups.done?.includes(statusName)) {
      return "done";
    }

    // Unlisted status in config: falls back to schema-derived group with warning
    const schemaGroup = schemaGroups.get(statusName);
    if (schemaGroup) {
      warn({
        event: "notion_status_fallback_to_schema",
        status: statusName,
        schemaGroup,
      });
      return schemaGroup;
    }

    // Unlisted and not in schema either
    warn({
      event: "notion_status_unknown",
      status: statusName,
      fallback: "todo",
    });
    return "todo";
  }

  // No config overrides: baseline schema derivation
  const schemaGroup = schemaGroups.get(statusName);
  if (schemaGroup) {
    return schemaGroup;
  }

  warn({
    event: "notion_status_unknown",
    status: statusName,
    fallback: "todo",
  });
  return "todo";
}

/**
 * Maps a Notion page to a snapshot.
 * - Joins ALL plain_text segments for title and rich_text (not just [0]).
 * - Unknown department → null + logs via the provided warn callback.
 * - Resolves status group via resolveStatusGroup (schema groups + config overrides + warning on fallback).
 * - Missing optional properties → default values (null/false).
 */
interface NotionPropertyItem {
  id?: string;
  type?: string;
  name?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  status?: { id?: string; name?: string };
  select?: { id?: string; name?: string } | null;
  date?: { start?: string } | null;
  checkbox?: boolean;
}

export function mapPage(
  page: PageObjectResponse,
  config: ProjectConfig,
  schemaGroups: Map<string, "todo" | "active" | "done">,
  warn: (msg: object) => void
): NotionTaskSnapshot {
  const props = (page.properties || {}) as Record<string, NotionPropertyItem>;

  function getProp(name: string): NotionPropertyItem | undefined {
    if (props[name]) return props[name];
    return Object.values(props).find((p) => p?.name === name);
  }

  // 1. Title: join ALL plain_text segments
  const titleProp = getProp(config.notion.properties.title);
  let title = "";
  if (titleProp?.type === "title" && Array.isArray(titleProp.title)) {
    title = titleProp.title
      .map((segment) => segment.plain_text || "")
      .join("");
  }

  // 2. Status: name + group resolution
  const statusProp = getProp(config.notion.properties.status);
  const statusName =
    statusProp?.type === "status" ? statusProp.status?.name || "" : "";
  const statusGroup = resolveStatusGroup(
    statusName,
    schemaGroups,
    config.notion.status_groups,
    warn
  );

  // 3. Department: select value matching config.departments
  const deptProp = getProp(config.notion.properties.department);
  let departmentId: string | null = null;
  if (deptProp?.type === "select" && deptProp.select?.name) {
    const rawVal = deptProp.select.name;
    const matchedDept = config.departments.find(
      (d) => d.notion_value === rawVal
    );
    if (matchedDept) {
      departmentId = matchedDept.id;
    } else {
      warn({
        event: "notion_unknown_department",
        value: rawVal,
        pageId: page.id,
      });
      departmentId = null;
    }
  }

  // 4. Milestone (optional): select value matching config.milestones
  let milestoneId: string | null = null;
  if (config.notion.properties.milestone) {
    const mProp = getProp(config.notion.properties.milestone);
    if (mProp?.type === "select" && mProp.select?.name && config.milestones) {
      const rawVal = mProp.select.name;
      const matchedM = config.milestones.find(
        (m) => (m.notion_value ?? m.name) === rawVal || m.id === rawVal
      );
      if (matchedM) {
        milestoneId = matchedM.id;
      }
    }
  }

  // 5. Due date (optional)
  let dueDate: string | null = null;
  if (config.notion.properties.due) {
    const dueProp = getProp(config.notion.properties.due);
    if (dueProp?.type === "date" && dueProp.date?.start) {
      dueDate = dueProp.date.start;
    }
  }

  // 6. Blocked (optional)
  let blocked = 0;
  if (config.notion.properties.blocked) {
    const blockedProp = getProp(config.notion.properties.blocked);
    if (blockedProp?.type === "checkbox") {
      blocked = blockedProp.checkbox ? 1 : 0;
    }
  }

  // 7. Blocker note (optional): join ALL plain_text segments
  let blockerNote: string | null = null;
  if (config.notion.properties.blocker_note) {
    const bnProp = getProp(config.notion.properties.blocker_note);
    if (bnProp?.type === "rich_text" && Array.isArray(bnProp.rich_text)) {
      const text = bnProp.rich_text
        .map((segment) => segment.plain_text || "")
        .join("");
      blockerNote = text.length > 0 ? text : null;
    }
  }

  // 8. Is Next (optional)
  let isNext = 0;
  if (config.notion.properties.next) {
    const nextProp = getProp(config.notion.properties.next);
    if (nextProp?.type === "checkbox") {
      isNext = nextProp.checkbox ? 1 : 0;
    }
  }

  // 9. Archived
  const isArchived = Boolean(
    ("in_trash" in page && page.in_trash) || page.archived
  );
  const archived = isArchived ? 1 : 0;

  return {
    pageId: page.id,
    title,
    status: statusName,
    statusGroup,
    departmentId,
    milestoneId,
    dueDate,
    blocked,
    blockerNote,
    isNext,
    url: page.url,
    archived,
    lastEditedTime: page.last_edited_time,
  };
}
