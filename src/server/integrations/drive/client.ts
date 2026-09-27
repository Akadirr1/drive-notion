import { auth, drive, type drive_v3 } from "@googleapis/drive";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface ListChildrenResponse {
  files: DriveFileItem[];
  nextPageToken?: string | null;
}

/**
 * Pure function validating and parsing a base64-encoded Google service account JSON string.
 * Throws readable errors naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 if missing,
 * invalid base64, invalid JSON, or missing client_email/private_key.
 */
export function parseServiceAccount(base64?: string): ServiceAccountCredentials {
  if (!base64 || typeof base64 !== "string" || base64.trim() === "") {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 environment variable is not set. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 in your environment or .env file."
    );
  }

  const trimmed = base64.trim();
  const normalized = trimmed.replace(/\s+/g, "");
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;

  if (!base64Regex.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not a valid base64-encoded string."
    );
  }

  let jsonStr: string;
  try {
    jsonStr = Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not a valid base64-encoded string."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 does not contain valid JSON."
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 does not contain a JSON object."
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.client_email !== "string" || !obj.client_email.trim()) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is missing required field "client_email".'
    );
  }

  if (typeof obj.private_key !== "string" || !obj.private_key.trim()) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is missing required field "private_key".'
    );
  }

  return {
    client_email: obj.client_email,
    private_key: obj.private_key,
    ...obj,
  };
}

let driveClientInstance: drive_v3.Drive | null = null;

/**
 * Returns a lazy singleton Drive client instance.
 * Throws if GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set or invalid.
 */
export function getDriveClient(): drive_v3.Drive {
  if (driveClientInstance) {
    return driveClientInstance;
  }

  const credentials = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64);

  const googleAuth = new auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  driveClientInstance = drive({
    version: "v3",
    auth: googleAuth,
    timeout: 30_000,
  });

  return driveClientInstance;
}

export function _resetDriveClientForTesting(): void {
  driveClientInstance = null;
}

/**
 * Thin wrapper calling Drive files.list to fetch immediate children of a folder.
 */
export async function listChildren(
  folderId: string,
  pageToken?: string
): Promise<ListChildrenResponse> {
  const client = getDriveClient();
  const escapedFolderId = folderId.replace(/'/g, "\\'");
  const res = await client.files.list({
    q: `'${escapedFolderId}' in parents and trashed = false`,
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "nextPageToken, files(id, name, mimeType, parents, createdTime, modifiedTime, webViewLink)",
    pageToken: pageToken || undefined,
  });

  const files: DriveFileItem[] = (res.data.files ?? [])
    .filter(
      (f): f is typeof f & { id: string; name: string; mimeType: string } =>
        typeof f.id === "string" &&
        typeof f.name === "string" &&
        typeof f.mimeType === "string"
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      parents: f.parents ?? undefined,
      createdTime: f.createdTime ?? undefined,
      modifiedTime: f.modifiedTime ?? undefined,
      webViewLink: f.webViewLink ?? undefined,
    }));

  return {
    files,
    nextPageToken: res.data.nextPageToken,
  };
}
