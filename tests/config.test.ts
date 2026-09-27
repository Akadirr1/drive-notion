import { describe, it, expect } from "vitest";
import { loadConfig } from "@/server/config";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const EXAMPLE_PATH = path.resolve(__dirname, "../config/project.example.yaml");

/**
 * Helper: write YAML string to a temp file and return its path.
 */
function writeTempYaml(content: string): string {
  const tmpFile = path.join(os.tmpdir(), `bumin-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describe("config loader", () => {
  it("parses project.example.yaml without errors", () => {
    const config = loadConfig(EXAMPLE_PATH);
    expect(config.project.name).toBe("BUMIN-2");
    expect(config.project.deadline).toBe("2026-12-31");
    expect(config.departments.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a missing required field with a readable message naming the field", () => {
    const yaml = `
project:
  deadline: "2026-12-31"
  deliverable: "test"
  timezone: Europe/Istanbul
  stale_days: 3
notion:
  tasks_data_source_id: "abc"
  properties:
    title: "Name"
    status: "Durum"
    department: "Departman"
drive:
  root_folder_id: "xyz"
departments:
  - id: "00"
    name: "Test"
    notion_value: "00 Test"
    drive_folder_id: "folder"
doc_types:
  test: ["test"]
`;

    const tmpFile = writeTempYaml(yaml);
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/project\.name/i);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("rejects a wrong type with a readable message naming the field and the file", () => {
    const yaml = `
project:
  name: "BUMIN-2"
  deadline: "2026-12-31"
  deliverable: "test"
  timezone: Europe/Istanbul
  stale_days: "not-a-number"
notion:
  tasks_data_source_id: "abc"
  properties:
    title: "Name"
    status: "Durum"
    department: "Departman"
drive:
  root_folder_id: "xyz"
departments:
  - id: "00"
    name: "Test"
    notion_value: "00 Test"
    drive_folder_id: "folder"
doc_types:
  test: ["test"]
`;

    const tmpFile = writeTempYaml(yaml);
    try {
      expect(() => loadConfig(tmpFile)).toThrow(/stale_days/i);
      // Also verify the error mentions the file path
      try {
        loadConfig(tmpFile);
      } catch (e: unknown) {
        expect((e as Error).message).toContain(tmpFile);
      }
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("rejects an invalid doc_types regex with a readable message naming the doc type and pattern", () => {
    const yaml = `
project:
  name: "BUMIN-2"
  deadline: "2026-12-31"
  deliverable: "test"
  timezone: Europe/Istanbul
  stale_days: 3
notion:
  tasks_data_source_id: "abc"
  properties:
    title: "Name"
    status: "Durum"
    department: "Departman"
drive:
  root_folder_id: "xyz"
departments:
  - id: "00"
    name: "Test"
    notion_value: "00 Test"
    drive_folder_id: "folder"
doc_types:
  broken_type: ["[invalid(regex"]
`;

    const tmpFile = writeTempYaml(yaml);
    try {
      expect(() => loadConfig(tmpFile)).toThrowError(
        /Invalid regular expression for doc_type "broken_type": "\[invalid\(regex"/
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
