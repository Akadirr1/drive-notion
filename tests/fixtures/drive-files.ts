import type { ProjectConfig } from "@/server/config";
import type { DriveFileItem } from "@/server/integrations/drive/client";
import type { DriveFileSnapshot } from "@/server/integrations/drive/map-file";
import type { RawEventRow } from "@/server/events/normalize";

export const mockDriveConfig: ProjectConfig = {
  project: {
    name: "BUMIN-2",
    deadline: "2026-12-31",
    deliverable: "2 uçan prototip",
    timezone: "Europe/Istanbul",
    stale_days: 3,
  },
  notion: {
    tasks_data_source_id: "mock-source-id",
    properties: {
      title: "Görev",
      status: "Durum",
      department: "WP",
    },
  },
  drive: {
    root_folder_id: "root-folder-id",
    silent_mime_prefixes: ["image/", "video/"],
    silent_name_patterns: ["\\.ulg$"],
  },
  departments: [
    {
      id: "00",
      name: "Koordinasyon",
      notion_value: "WP-00",
      drive_folder_id: "folder-00",
    },
    {
      id: "01",
      name: "Avionik",
      notion_value: "WP-01",
      drive_folder_id: "folder-01",
    },
    {
      id: "02",
      name: "Haberleşme",
      notion_value: "WP-02",
      drive_folder_id: "folder-02",
    },
    {
      id: "03",
      name: "Kamera & Gimbal",
      notion_value: "WP-03",
      drive_folder_id: "folder-03",
    },
  ],
  doc_types: {
    handoff: ["^HO-\\d"],
    decision: ["_DECISION"],
    test: ["(^|[_-])(TEST|ATP)"],
    report: ["report", "rapor"],
  },
};

export const sampleDriveFiles: Record<string, DriveFileItem> = {
  folder01: {
    id: "folder-01",
    name: "01 Avionik",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["root-folder-id"],
    createdTime: "2026-09-01T10:00:00.000Z",
    modifiedTime: "2026-09-01T10:00:00.000Z",
  },
  subfolder01: {
    id: "subfolder-01",
    name: "Tasarım Dosyaları",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["folder-01"],
    createdTime: "2026-09-02T10:00:00.000Z",
    modifiedTime: "2026-09-02T10:00:00.000Z",
  },
  reportInSubfolder: {
    id: "file-001",
    name: "Hover_TEST_raporu_v1.pdf",
    mimeType: "application/pdf",
    parents: ["subfolder-01"],
    createdTime: "2026-09-10T12:00:00.000Z",
    modifiedTime: "2026-09-10T12:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-001/view",
  },
  silentImage: {
    id: "file-img-001",
    name: "schematic.png",
    mimeType: "image/png",
    parents: ["folder-01"],
    createdTime: "2026-09-10T12:00:00.000Z",
    modifiedTime: "2026-09-10T12:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-img-001/view",
  },
  silentLog: {
    id: "file-log-001",
    name: "flight-12.ulg",
    mimeType: "application/octet-stream",
    parents: ["folder-01"],
    createdTime: "2026-09-10T12:00:00.000Z",
    modifiedTime: "2026-09-10T12:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-log-001/view",
  },
  handoffFileInRoot: {
    id: "file-ho-001",
    name: "HO-01_WP-03_flight_camera_handoff.pdf",
    mimeType: "application/pdf",
    parents: ["root-folder-id"],
    createdTime: "2026-09-11T09:00:00.000Z",
    modifiedTime: "2026-09-11T09:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-ho-001/view",
  },
  unmatchedFile: {
    id: "file-general-001",
    name: "Meeting_Notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    parents: ["root-folder-id"],
    createdTime: "2026-09-12T14:00:00.000Z",
    modifiedTime: "2026-09-12T14:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-general-001/view",
  },
};

export const sampleSnapshots: Record<string, DriveFileSnapshot> = {
  reportDoc: {
    fileId: "file-001",
    name: "Hover_TEST_raporu_v1.pdf",
    mimeType: "application/pdf",
    isFolder: 0,
    parentId: "subfolder-01",
    departmentId: "01",
    docType: "test",
    createdTime: "2026-09-10T12:00:00.000Z",
    modifiedTime: "2026-09-10T12:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/file-001/view",
    trashed: 0,
  },
};

export const sampleDriveRawEvents: Record<string, RawEventRow> = {
  docCreated: {
    id: 101,
    source: "drive",
    kind: "doc:created",
    externalId: "file-001",
    payload: JSON.stringify({
      before: null,
      after: {
        name: "Hover_TEST_raporu_v1.pdf",
        departmentId: "01",
        docType: "test",
        webViewLink: "https://drive.google.com/file/d/file-001/view",
      },
    }),
    occurredAt: "2026-09-10T12:00:00.000Z",
    ingestedAt: "2026-09-10T12:00:05.000Z",
    processed: 0,
  },
  docUpdated: {
    id: 102,
    source: "drive",
    kind: "doc:updated",
    externalId: "file-001",
    payload: JSON.stringify({
      before: {
        name: "Hover_TEST_raporu_v1.pdf",
        departmentId: "01",
        docType: "test",
        webViewLink: "https://drive.google.com/file/d/file-001/view",
      },
      after: {
        name: "Hover_TEST_raporu_v2.pdf",
        departmentId: "01",
        docType: "test",
        webViewLink: "https://drive.google.com/file/d/file-001/view",
      },
    }),
    occurredAt: "2026-09-10T12:20:00.000Z",
    ingestedAt: "2026-09-10T12:20:05.000Z",
    processed: 0,
  },
};
