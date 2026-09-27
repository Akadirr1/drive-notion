import type { ProjectConfig } from "@/server/config";
import type { DriveFileItem } from "./client";
import type { RawEventDescriptor } from "../notion/diff-task";

export interface DriveFileSnapshot {
  fileId: string;
  name: string;
  mimeType: string;
  isFolder: number; // 0 or 1
  parentId: string | null;
  departmentId: string | null;
  docType: string | null;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  trashed: number; // 0 or 1
}

export interface DocAfterPayload {
  name: string;
  departmentId: string | null;
  docType: string | null;
  webViewLink: string;
}

export interface DocEventPayload {
  before: DocAfterPayload | null;
  after: DocAfterPayload;
}

/**
 * Resolves the department ID for a file or folder.
 * Priority:
 * 1. If the item itself matches a department's drive_folder_id.
 * 2. Walk up parent hierarchy (nearest ancestor wins).
 * 3. Fallback: regex WP-(\d{2}) on the file name.
 * 4. Otherwise null.
 */
export function resolveDepartmentId(
  fileId: string,
  fileName: string,
  parentId: string | null,
  parentMap: Map<string, string | null>,
  departmentFolderMap: Map<string, string>, // drive_folder_id -> department.id
  departments: ProjectConfig["departments"]
): string | null {
  // 1. Direct match on item's own id
  if (departmentFolderMap.has(fileId)) {
    return departmentFolderMap.get(fileId)!;
  }

  // 2. Nearest ancestor in parent hierarchy
  let currentParentId = parentId;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    if (departmentFolderMap.has(currentParentId)) {
      return departmentFolderMap.get(currentParentId)!;
    }
    currentParentId = parentMap.get(currentParentId) ?? null;
  }

  // 3. Fallback: regex WP-(\d{2}) on file name
  const match = fileName.match(/WP-(\d{2})/i);
  if (match) {
    const code = match[1];
    const dept = departments.find(
      (d) =>
        d.id === code ||
        d.notion_value.toUpperCase().includes(`WP-${code}`) ||
        d.id.padStart(2, "0") === code
    );
    if (dept) {
      return dept.id;
    }
  }

  return null;
}

/**
 * Resolves doc_type from config.doc_types regex patterns.
 * Folders return null. Files return first matching type, or "other" if none match.
 */
export function resolveDocType(
  fileName: string,
  isFolder: boolean,
  docTypes: ProjectConfig["doc_types"]
): string | null {
  if (isFolder) {
    return null;
  }

  for (const [type, patterns] of Object.entries(docTypes)) {
    for (const pattern of patterns) {
      try {
        if (new RegExp(pattern, "i").test(fileName)) {
          return type;
        }
      } catch {
        // Config validator guarantees valid regexes
      }
    }
  }

  return "other";
}

/**
 * Determines whether a file is silent (persisted in DB, but never emits events).
 */
export function isSilentFile(
  file: { name: string; mimeType: string },
  config: ProjectConfig
): boolean {
  const mimePrefixes = config.drive.silent_mime_prefixes ?? [];
  for (const prefix of mimePrefixes) {
    if (file.mimeType.startsWith(prefix)) {
      return true;
    }
  }

  const namePatterns = config.drive.silent_name_patterns ?? [];
  for (const pattern of namePatterns) {
    try {
      if (new RegExp(pattern, "i").test(file.name)) {
        return true;
      }
    } catch {
      // Ignored
    }
  }

  return false;
}

/**
 * Maps a Drive API item into a database snapshot.
 */
export function mapFile(
  file: DriveFileItem,
  parentMap: Map<string, string | null>,
  departmentFolderMap: Map<string, string>,
  config: ProjectConfig
): DriveFileSnapshot {
  const isFolder = file.mimeType === "application/vnd.google-apps.folder" ? 1 : 0;
  const parentId = file.parents?.[0] ?? null;

  const departmentId = resolveDepartmentId(
    file.id,
    file.name,
    parentId,
    parentMap,
    departmentFolderMap,
    config.departments
  );

  const docType = resolveDocType(file.name, isFolder === 1, config.doc_types);

  return {
    fileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    isFolder,
    parentId,
    departmentId,
    docType,
    createdTime: file.createdTime ?? new Date().toISOString(),
    modifiedTime: file.modifiedTime ?? file.createdTime ?? new Date().toISOString(),
    webViewLink: file.webViewLink ?? "",
    trashed: 0,
  };
}

/**
 * Builds the "after" payload object for raw events.
 */
export function buildAfterPayload(snapshot: DriveFileSnapshot): DocAfterPayload {
  return {
    name: snapshot.name,
    departmentId: snapshot.departmentId,
    docType: snapshot.docType,
    webViewLink: snapshot.webViewLink,
  };
}

/**
 * Computes raw events for file changes between before and after.
 * Returns empty array if:
 * - File is silent
 * - File is a folder
 * - File was restored from trash (1 -> 0)
 * - File is trashed
 * - No change in name or modifiedTime
 */
export function diffFile(
  before: DriveFileSnapshot | null,
  after: DriveFileSnapshot,
  silent: boolean,
  crawlTime?: string
): RawEventDescriptor[] {
  if (silent || after.isFolder === 1 || after.trashed === 1) {
    return [];
  }

  // Restore from trash emits no event
  if (before && before.trashed === 1 && after.trashed === 0) {
    return [];
  }

  // New file
  if (!before) {
    return [
      {
        kind: "doc:created",
        externalId: after.fileId,
        payload: JSON.stringify({
          before: null,
          after: buildAfterPayload(after),
        } satisfies DocEventPayload),
        occurredAt: after.createdTime,
      },
    ];
  }

  // Existing file modified or renamed
  if (before.name !== after.name || before.modifiedTime !== after.modifiedTime) {
    const isRenameOnly =
      before.name !== after.name && before.modifiedTime === after.modifiedTime;
    const occurredAt =
      isRenameOnly && crawlTime ? crawlTime : after.modifiedTime;

    return [
      {
        kind: "doc:updated",
        externalId: after.fileId,
        payload: JSON.stringify({
          before: buildAfterPayload(before),
          after: buildAfterPayload(after),
        } satisfies DocEventPayload),
        occurredAt,
      },
    ];
  }

  return [];
}
