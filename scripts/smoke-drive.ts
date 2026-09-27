import { loadConfig } from "@/server/config";
import { listChildren } from "@/server/integrations/drive/client";
import { mapFile } from "@/server/integrations/drive/map-file";

async function main() {
  console.log("Loading configuration...");
  const config = loadConfig();

  console.log(`Root folder ID: ${config.drive.root_folder_id}`);
  console.log("Connecting to Google Drive and fetching root children...");

  const departmentFolderMap = new Map<string, string>();
  for (const dept of config.departments) {
    departmentFolderMap.set(dept.drive_folder_id, dept.id);
  }

  const parentMap = new Map<string, string | null>();
  const res = await listChildren(config.drive.root_folder_id);

  console.log(`\nFound ${res.files.length} item(s) in root folder:\n`);

  for (const file of res.files) {
    parentMap.set(file.id, config.drive.root_folder_id);
    const snapshot = mapFile(file, parentMap, departmentFolderMap, config);
    const typeLabel = snapshot.isFolder ? "[FOLDER]" : `[${snapshot.docType ?? "other"}]`;
    const deptLabel = snapshot.departmentId ? `WP-${snapshot.departmentId}` : "Unassigned";

    console.log(
      `  ${typeLabel.padEnd(12)} ${snapshot.name.padEnd(40)} ${deptLabel.padEnd(12)} (${snapshot.fileId})`
    );
  }

  console.log("\nGoogle Drive read smoke test succeeded.\n");
}

main().catch((err) => {
  console.error("\nDrive smoke test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
