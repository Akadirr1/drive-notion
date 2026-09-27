import { z } from "zod";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// --- Zod schemas ---

const projectSchema = z.object({
  name: z.string(),
  deadline: z.string().date("deadline must be a YYYY-MM-DD date string"),
  deliverable: z.string(),
  timezone: z.string(),
  stale_days: z.number().int().positive(),
});

const notionPropertiesSchema = z.object({
  title: z.string(),
  status: z.string(),
  department: z.string(),
  due: z.string().optional(),
  blocked: z.string().optional(),
  blocker_note: z.string().optional(),
  milestone: z.string().optional(),
  next: z.string().optional(),
});

const statusGroupsSchema = z
  .object({
    todo: z.array(z.string()),
    active: z.array(z.string()),
    done: z.array(z.string()),
  })
  .optional();

const notionSchema = z.object({
  tasks_data_source_id: z.string().min(1, "notion.tasks_data_source_id is required"),
  properties: notionPropertiesSchema,
  status_groups: statusGroupsSchema,
});

const driveSchema = z.object({
  root_folder_id: z.string().min(1, "drive.root_folder_id is required"),
});

const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  notion_value: z.string(),
  drive_folder_id: z.string(),
});

const milestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  due: z.string().date("milestone due must be a YYYY-MM-DD date string"),
  notion_value: z.string().optional(),
});

const docTypesSchema = z.record(z.string(), z.array(z.string()));

export const projectConfigSchema = z.object({
  project: projectSchema,
  notion: notionSchema,
  drive: driveSchema,
  departments: z.array(departmentSchema).min(1, "At least one department is required"),
  doc_types: docTypesSchema,
  milestones: z.array(milestoneSchema).optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

// --- Loader ---

/**
 * Loads and validates the project config from a YAML file.
 * Throws a readable error naming the invalid field and the config file path.
 */
export function loadConfig(configPath?: string): ProjectConfig {
  const filePath = configPath ?? process.env.CONFIG_PATH ?? "config/project.yaml";

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Could not read config file: ${filePath}\n${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      `Invalid YAML in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  const result = projectConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Invalid config in ${filePath}:\n${issues}`);
  }

  return result.data;
}
