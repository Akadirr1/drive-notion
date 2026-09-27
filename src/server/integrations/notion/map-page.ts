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
      select?: {
        options?: Array<{ id: string; name: string; color?: string; description?: string | null }>;
      };
      options?: Array<{ id?: string; name: string; color?: string; description?: string | null }>;
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
  priorityRank: number | null;
  sortOrder: number | null;
  url: string;
  archived: number; // 0 or 1
  lastEditedTime: string;
}

export function getPropOptions(
  prop:
    | {
        status?: { options?: Array<{ id?: string; name: string }> };
        select?: { options?: Array<{ id?: string; name: string }> };
        options?: Array<{ id?: string; name: string }>;
      }
    | undefined
): string[] {
  if (!prop) return [];
  if (prop.select?.options && Array.isArray(prop.select.options)) {
    return prop.select.options.map((o) => o.name);
  }
  if (prop.status?.options && Array.isArray(prop.status.options)) {
    return prop.status.options.map((o) => o.name);
  }
  if (Array.isArray(prop.options)) {
    return prop.options.map((o) => o.name);
  }
  return [];
}

/**
 * Builds a query filter for Notion queryDataSource based on config.notion.row_filter.
 */
export function buildRowFilter(rowFilter?: { property: string; equals: string }) {
  if (!rowFilter) {
    return undefined;
  }
  return {
    property: rowFilter.property,
    select: {
      equals: rowFilter.equals,
    },
  };
}

/**
 * Validates the data source schema against config.notion.properties and constraints.
 * Throws PropertyConfigError naming the property, expected type, and config/project.yaml.
 */
export function validateSchema(
  schema: DataSourceSchema,
  config: ProjectConfig,
  warn?: (msg: object) => void
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

  // 1. Title property (required)
  checkProp("title", config.notion.properties.title, "title", true);

  // 2. Status property: accepts "status" or "select"
  const statusProp = findProp(config.notion.properties.status);
  if (!statusProp) {
    throw new PropertyConfigError(
      `Notion property "${config.notion.properties.status}" (configured as notion.properties.status in config/project.yaml) not found in schema. Available properties: [${availableList}]`
    );
  }

  if (statusProp.type !== "status" && statusProp.type !== "select") {
    throw new PropertyConfigError(
      `Notion property "${config.notion.properties.status}" (configured as notion.properties.status in config/project.yaml) expected type "status" or "select" but found "${statusProp.type}". Available properties: [${availableList}]`
    );
  }

  // 3. Department property (required)
  checkProp("department", config.notion.properties.department, "select", true);

  const statusOptions = getPropOptions(statusProp);

  // For select: status_groups is required, and every option of the select must appear in exactly one group
  if (statusProp.type === "select") {
    if (!config.notion.status_groups) {
      throw new PropertyConfigError(
        `notion.status_groups is required in config/project.yaml when notion.properties.status is of type "select"`
      );
    }

    const { todo = [], active = [], done = [] } = config.notion.status_groups;
    const unlisted: string[] = [];
    const duplicated: string[] = [];

    for (const opt of statusOptions) {
      const inTodo = todo.filter((v) => v === opt).length;
      const inActive = active.filter((v) => v === opt).length;
      const inDone = done.filter((v) => v === opt).length;
      const total = inTodo + inActive + inDone;

      if (total === 0) {
        unlisted.push(opt);
      } else if (total > 1) {
        duplicated.push(opt);
      }
    }

    if (unlisted.length > 0) {
      throw new PropertyConfigError(
        `Unlisted status option(s) in config/project.yaml under notion.status_groups: [${unlisted.join(", ")}]. All options of select property "${config.notion.properties.status}" must appear in exactly one group.`
      );
    }

    if (duplicated.length > 0) {
      throw new PropertyConfigError(
        `Duplicated status option(s) in config/project.yaml under notion.status_groups: [${duplicated.join(", ")}]. Every option must appear in exactly one group.`
      );
    }

    // A listed value that is not an option only logs a warning
    const allListed = [...todo, ...active, ...done];
    for (const listed of allListed) {
      if (!statusOptions.includes(listed)) {
        const warnObj = {
          event: "notion_status_group_unknown_option",
          option: listed,
          property: config.notion.properties.status,
        };
        if (warn) {
          warn(warnObj);
        } else {
          console.warn(JSON.stringify(warnObj));
        }
      }
    }
  }

  // 4. Blocked statuses (optional string[])
  if (config.notion.blocked_statuses && config.notion.blocked_statuses.length > 0) {
    const unknownBlocked = config.notion.blocked_statuses.filter(
      (status) => !statusOptions.includes(status)
    );
    if (unknownBlocked.length > 0) {
      throw new PropertyConfigError(
        `Unknown blocked_statuses option(s) in config/project.yaml: [${unknownBlocked.join(", ")}]. Available options for status property "${config.notion.properties.status}": [${statusOptions.join(", ")}]`
      );
    }
  }

  // 5. Row filter (optional { property, equals })
  if (config.notion.row_filter) {
    const rf = config.notion.row_filter;
    const rfProp = findProp(rf.property);
    if (!rfProp) {
      throw new PropertyConfigError(
        `Row filter property "${rf.property}" (configured in notion.row_filter in config/project.yaml) not found in schema. Available properties: [${availableList}]`
      );
    }
    if (rfProp.type !== "select") {
      throw new PropertyConfigError(
        `Row filter property "${rf.property}" (configured in notion.row_filter in config/project.yaml) expected type "select" but found "${rfProp.type}".`
      );
    }
    const rfOptions = getPropOptions(rfProp);
    if (!rfOptions.includes(rf.equals)) {
      throw new PropertyConfigError(
        `Row filter option "${rf.equals}" (configured in notion.row_filter.equals in config/project.yaml) is not an option of property "${rf.property}". Available options: [${rfOptions.join(", ")}]`
      );
    }
  }

  // 6. Optional properties
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
  if (config.notion.properties.priority) {
    checkProp("priority", config.notion.properties.priority, "select", false);
  }
  if (config.notion.properties.order) {
    checkProp("order", config.notion.properties.order, "number", false);
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
 * - An empty status maps to "todo" without a warning.
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
  if (!statusName) {
    return "todo";
  }

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
 * - Resolves status group via resolveStatusGroup.
 * - Handles select and status property types for status.
 * - Empty status maps to "todo" without a warning.
 * - Blocked: true if status in config.notion.blocked_statuses or blocked checkbox is true.
 * - Blocker note: stored only while blocked; otherwise null.
 * - Priority rank: index in select options (0 = first), or null.
 * - Sort order: number value or null.
 * - Missing optional properties → default values (null/0).
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
  number?: number | null;
}

export function mapPage(
  page: PageObjectResponse,
  config: ProjectConfig,
  schemaGroups: Map<string, "todo" | "active" | "done">,
  warn: (msg: object) => void,
  schemaOrPriorityOptions?: DataSourceSchema | string[]
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

  // 2. Status: read .select.name or .status.name depending on the type
  const statusProp = getProp(config.notion.properties.status);
  let statusName = "";
  if (statusProp?.type === "select") {
    statusName = statusProp.select?.name || "";
  } else if (statusProp?.type === "status") {
    statusName = statusProp.status?.name || "";
  }

  const statusGroup = !statusName
    ? "todo"
    : resolveStatusGroup(
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

  // 6. Blocked: status in blocked_statuses OR configured blocked checkbox is true
  let isBlocked = false;
  if (
    config.notion.blocked_statuses &&
    config.notion.blocked_statuses.includes(statusName)
  ) {
    isBlocked = true;
  }
  if (config.notion.properties.blocked) {
    const blockedProp = getProp(config.notion.properties.blocked);
    if (blockedProp?.type === "checkbox" && blockedProp.checkbox) {
      isBlocked = true;
    }
  }
  const blocked = isBlocked ? 1 : 0;

  // 7. Blocker note: stored ONLY while blocked; otherwise null
  let blockerNote: string | null = null;
  if (blocked === 1 && config.notion.properties.blocker_note) {
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

  // 9. Priority rank: index of the option in schema's select options (0 = first)
  let priorityRank: number | null = null;
  if (config.notion.properties.priority) {
    const priorityProp = getProp(config.notion.properties.priority);
    if (priorityProp?.type === "select" && priorityProp.select?.name) {
      const selectedName = priorityProp.select.name;
      let options: string[] = [];
      if (Array.isArray(schemaOrPriorityOptions)) {
        options = schemaOrPriorityOptions;
      } else if (
        schemaOrPriorityOptions &&
        typeof schemaOrPriorityOptions === "object" &&
        "properties" in schemaOrPriorityOptions
      ) {
        const prop =
          schemaOrPriorityOptions.properties?.[config.notion.properties.priority] ??
          Object.values(schemaOrPriorityOptions.properties || {}).find(
            (item) => item.name === config.notion.properties.priority
          );
        options = getPropOptions(prop);
      }
      const idx = options.indexOf(selectedName);
      priorityRank = idx >= 0 ? idx : null;
    }
  }

  // 10. Sort order: number or null
  let sortOrder: number | null = null;
  if (config.notion.properties.order) {
    const orderProp = getProp(config.notion.properties.order);
    if (orderProp?.type === "number" && typeof orderProp.number === "number") {
      sortOrder = orderProp.number;
    }
  }

  // 11. Archived
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
    priorityRank,
    sortOrder,
    url: page.url,
    archived,
    lastEditedTime: page.last_edited_time,
  };
}
