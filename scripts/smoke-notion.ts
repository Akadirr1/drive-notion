import { loadConfig } from "@/server/config";
import {
  queryDataSource,
  retrieveDataSource,
} from "@/server/integrations/notion/client";
import {
  validateSchema,
  mapPage,
  deriveStatusGroups,
  type DataSourceSchema,
} from "@/server/integrations/notion/map-page";
import type { PageObjectResponse } from "@notionhq/client";

async function main() {
  console.log("Loading configuration...");
  const config = loadConfig();

  console.log("Retrieving data source schema...");
  const rawSchema = await retrieveDataSource(config.notion.tasks_data_source_id);
  const schema = rawSchema as unknown as DataSourceSchema;

  console.log("Validating schema against configuration...");
  validateSchema(schema, config);
  console.log("Schema validation passed.");

  const schemaGroups = deriveStatusGroups(
    schema,
    config.notion.properties.status
  );

  console.log("Querying first 5 tasks from Notion...");
  const response = await queryDataSource(config.notion.tasks_data_source_id, {
    page_size: 5,
  });

  const pages = response.results.filter(
    (item): item is PageObjectResponse => "properties" in item
  );

  console.log(`\nRetrieved ${pages.length} task(s):\n`);

  for (const page of pages) {
    let unknownDeptFlag = false;
    const warn = (msg: unknown) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "event" in msg &&
        (msg as { event?: string }).event === "notion_unknown_department"
      ) {
        unknownDeptFlag = true;
      }
    };

    const snapshot = mapPage(page, config, schemaGroups, warn);
    const shortId = snapshot.pageId.slice(0, 8);
    const deptDisplay =
      snapshot.departmentId ?? (unknownDeptFlag ? "⚠ unknown" : "none");
    const blockedDisplay = snapshot.blocked ? "✓" : "✗";
    const nextDisplay = snapshot.isNext ? "✓" : "✗";

    console.log(
      `[${shortId}] "${snapshot.title}" | Status: ${snapshot.status} (${snapshot.statusGroup}) | Dept: ${deptDisplay} | Blocked: ${blockedDisplay} | Next: ${nextDisplay} | URL: ${snapshot.url}`
    );
  }

  console.log(`\nShowing ${pages.length} tasks`);
}

main().catch((err) => {
  console.error(
    "Smoke check failed:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
