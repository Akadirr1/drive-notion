import { describe, it, expect } from "vitest";
import {
  mapFile,
  diffFile,
  resolveDepartmentId,
  resolveDocType,
  isSilentFile,
  buildAfterPayload,
  type DriveFileSnapshot,
} from "@/server/integrations/drive/map-file";
import { mockDriveConfig, sampleDriveFiles } from "./fixtures/drive-files";

describe("Drive mapFile & diffFile pure functions", () => {
  const departmentFolderMap = new Map<string, string>([
    ["folder-00", "00"],
    ["folder-01", "01"],
    ["folder-02", "02"],
    ["folder-03", "03"],
  ]);

  describe("resolveDepartmentId", () => {
    it("resolves directly when the folder itself is in departmentFolderMap", () => {
      const parentMap = new Map<string, string | null>([
        ["folder-01", "root-folder-id"],
      ]);
      const deptId = resolveDepartmentId(
        "folder-01",
        "01 Avionik",
        "root-folder-id",
        parentMap,
        departmentFolderMap,
        mockDriveConfig.departments
      );
      expect(deptId).toBe("01");
    });

    it("resolves to nearest department folder ancestor", () => {
      const parentMap = new Map<string, string | null>([
        ["file-001", "subfolder-01"],
        ["subfolder-01", "folder-01"],
        ["folder-01", "root-folder-id"],
      ]);
      const deptId = resolveDepartmentId(
        "file-001",
        "report.pdf",
        "subfolder-01",
        parentMap,
        departmentFolderMap,
        mockDriveConfig.departments
      );
      expect(deptId).toBe("01");
    });

    it("falls back to file name WP-(\\d{2}) regex when outside department folders", () => {
      const parentMap = new Map<string, string | null>([
        ["file-ho-001", "root-folder-id"],
      ]);
      const deptId = resolveDepartmentId(
        "file-ho-001",
        "HO-01_WP-03_flight_camera_handoff.pdf",
        "root-folder-id",
        parentMap,
        departmentFolderMap,
        mockDriveConfig.departments
      );
      expect(deptId).toBe("03");
    });

    it("returns null when neither ancestor nor file name matches", () => {
      const parentMap = new Map<string, string | null>([
        ["file-gen-001", "root-folder-id"],
      ]);
      const deptId = resolveDepartmentId(
        "file-gen-001",
        "Meeting_Notes.docx",
        "root-folder-id",
        parentMap,
        departmentFolderMap,
        mockDriveConfig.departments
      );
      expect(deptId).toBeNull();
    });
  });

  describe("resolveDocType", () => {
    it("returns null for folders", () => {
      expect(resolveDocType("Test Raporları", true, mockDriveConfig.doc_types)).toBeNull();
    });

    it("matches configured regex patterns (case-insensitive)", () => {
      expect(resolveDocType("HO-01_WP-03.pdf", false, mockDriveConfig.doc_types)).toBe("handoff");
      expect(resolveDocType("Flight_TEST_Log.pdf", false, mockDriveConfig.doc_types)).toBe("test");
      expect(resolveDocType("Final_report.pdf", false, mockDriveConfig.doc_types)).toBe("report");
      expect(resolveDocType("final_DECISION_notes.txt", false, mockDriveConfig.doc_types)).toBe("decision");
    });

    it("returns 'other' when no doc_type pattern matches", () => {
      expect(resolveDocType("misc_document.pdf", false, mockDriveConfig.doc_types)).toBe("other");
    });
  });

  describe("isSilentFile", () => {
    it("returns true for silent mime prefix (image/)", () => {
      expect(
        isSilentFile(
          { name: "photo.jpg", mimeType: "image/jpeg" },
          mockDriveConfig
        )
      ).toBe(true);
      expect(
        isSilentFile(
          { name: "diagram.png", mimeType: "image/png" },
          mockDriveConfig
        )
      ).toBe(true);
    });

    it("returns true for silent name pattern (\\.ulg$)", () => {
      expect(
        isSilentFile(
          { name: "flight-log-1.ulg", mimeType: "application/octet-stream" },
          mockDriveConfig
        )
      ).toBe(true);
    });

    it("returns false for regular documents", () => {
      expect(
        isSilentFile(
          { name: "Flight_Test_Report.pdf", mimeType: "application/pdf" },
          mockDriveConfig
        )
      ).toBe(false);
    });
  });

  describe("mapFile", () => {
    it("correctly maps a file item to DriveFileSnapshot", () => {
      const parentMap = new Map<string, string | null>([
        ["file-001", "subfolder-01"],
        ["subfolder-01", "folder-01"],
        ["folder-01", "root-folder-id"],
      ]);

      const snapshot = mapFile(
        sampleDriveFiles.reportInSubfolder,
        parentMap,
        departmentFolderMap,
        mockDriveConfig
      );

      expect(snapshot).toEqual({
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
      });
    });

    it("correctly maps a folder item (isFolder = 1, docType = null)", () => {
      const parentMap = new Map<string, string | null>([
        ["folder-01", "root-folder-id"],
      ]);

      const snapshot = mapFile(
        sampleDriveFiles.folder01,
        parentMap,
        departmentFolderMap,
        mockDriveConfig
      );

      expect(snapshot.isFolder).toBe(1);
      expect(snapshot.docType).toBeNull();
      expect(snapshot.departmentId).toBe("01");
    });
  });

  describe("diffFile", () => {
    const baseSnapshot: DriveFileSnapshot = {
      fileId: "file-100",
      name: "Test_Plan.pdf",
      mimeType: "application/pdf",
      isFolder: 0,
      parentId: "folder-01",
      departmentId: "01",
      docType: "test",
      createdTime: "2026-09-10T10:00:00.000Z",
      modifiedTime: "2026-09-10T10:00:00.000Z",
      webViewLink: "https://drive.google.com/view/100",
      trashed: 0,
    };

    it("emits doc:created when before is null (new file)", () => {
      const events = diffFile(null, baseSnapshot, false);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("doc:created");
      expect(events[0].externalId).toBe("file-100");
      expect(events[0].occurredAt).toBe("2026-09-10T10:00:00.000Z");

      const payload = JSON.parse(events[0].payload);
      expect(payload.before).toBeNull();
      expect(payload.after).toEqual(buildAfterPayload(baseSnapshot));
    });

    it("emits doc:updated when modifiedTime changes", () => {
      const updatedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        modifiedTime: "2026-09-10T10:30:00.000Z",
      };

      const events = diffFile(baseSnapshot, updatedSnapshot, false);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("doc:updated");
      expect(events[0].externalId).toBe("file-100");
      expect(events[0].occurredAt).toBe("2026-09-10T10:30:00.000Z");

      const payload = JSON.parse(events[0].payload);
      expect(payload.before).toEqual(buildAfterPayload(baseSnapshot));
      expect(payload.after).toEqual(buildAfterPayload(updatedSnapshot));
    });

    it("emits doc:updated with crawlTime when file is renamed (only name changes)", () => {
      const renamedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        name: "Test_Plan_v2.pdf",
      };
      const crawlTime = "2026-09-28T01:15:00.000Z";

      const events = diffFile(baseSnapshot, renamedSnapshot, false, crawlTime);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("doc:updated");
      expect(events[0].externalId).toBe("file-100");
      expect(events[0].occurredAt).toBe(crawlTime);

      const payload = JSON.parse(events[0].payload);
      expect(payload.before.name).toBe("Test_Plan.pdf");
      expect(payload.after.name).toBe("Test_Plan_v2.pdf");
    });

    it("emits doc:updated with modifiedTime when modifiedTime changed, even if crawlTime is provided", () => {
      const updatedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        modifiedTime: "2026-09-10T10:30:00.000Z",
      };
      const crawlTime = "2026-09-28T01:15:00.000Z";

      const events = diffFile(baseSnapshot, updatedSnapshot, false, crawlTime);
      expect(events).toHaveLength(1);
      expect(events[0].occurredAt).toBe("2026-09-10T10:30:00.000Z");
    });

    it("emits doc:updated with modifiedTime when both name and modifiedTime change", () => {
      const changedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        name: "Test_Plan_v3.pdf",
        modifiedTime: "2026-09-10T11:00:00.000Z",
      };
      const crawlTime = "2026-09-28T01:15:00.000Z";

      const events = diffFile(baseSnapshot, changedSnapshot, false, crawlTime);
      expect(events).toHaveLength(1);
      expect(events[0].occurredAt).toBe("2026-09-10T11:00:00.000Z");
    });

    it("falls back to after.modifiedTime when only name changed but crawlTime is omitted", () => {
      const renamedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        name: "Test_Plan_v2.pdf",
      };

      const events = diffFile(baseSnapshot, renamedSnapshot, false);
      expect(events).toHaveLength(1);
      expect(events[0].occurredAt).toBe(baseSnapshot.modifiedTime);
    });

    it("emits no event when file is silent", () => {
      const events = diffFile(null, baseSnapshot, true);
      expect(events).toEqual([]);
    });

    it("emits no event for folders", () => {
      const folderSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        isFolder: 1,
      };
      const events = diffFile(null, folderSnapshot, false);
      expect(events).toEqual([]);
    });

    it("emits no event when a file is restored from trash (1 -> 0)", () => {
      const trashedBefore: DriveFileSnapshot = {
        ...baseSnapshot,
        trashed: 1,
      };
      const restoredAfter: DriveFileSnapshot = {
        ...baseSnapshot,
        trashed: 0,
      };

      const events = diffFile(trashedBefore, restoredAfter, false);
      expect(events).toEqual([]);
    });

    it("emits no event when file is moved between WP folders without name or modifiedTime change", () => {
      const movedSnapshot: DriveFileSnapshot = {
        ...baseSnapshot,
        parentId: "folder-02",
        departmentId: "02",
      };

      const events = diffFile(baseSnapshot, movedSnapshot, false);
      expect(events).toEqual([]);
    });

    it("emits no event when file is completely unchanged", () => {
      const events = diffFile(baseSnapshot, baseSnapshot, false);
      expect(events).toEqual([]);
    });
  });
});
