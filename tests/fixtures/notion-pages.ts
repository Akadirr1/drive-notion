import type { PageObjectResponse } from "@notionhq/client";
import type { ProjectConfig } from "@/server/config";
import type { DataSourceSchema } from "@/server/integrations/notion/map-page";

export const testProjectConfig: ProjectConfig = {
  project: {
    name: "BUMIN-2",
    deadline: "2026-12-31",
    deliverable: "Multirotor UAV",
    timezone: "Europe/Istanbul",
    stale_days: 14,
  },
  notion: {
    tasks_data_source_id: "ds-12345",
    properties: {
      title: "Görev",
      status: "Durum",
      department: "Birim",
      due: "Bitiş Tarihi",
      blocked: "Tıkalı",
      blocker_note: "Tıkanıklık Nedeni",
      milestone: "Kilometre Taşı",
      next: "Sıradaki Eylem",
    },
    // status_groups can be set or omitted per test
  },
  drive: {
    root_folder_id: "drive-root-001",
  },
  departments: [
    {
      id: "00",
      name: "Genel / Yönetim",
      notion_value: "Genel / Yönetim",
      drive_folder_id: "folder-00",
    },
    {
      id: "01",
      name: "Aviyonik",
      notion_value: "Aviyonik",
      drive_folder_id: "folder-01",
    },
    {
      id: "02",
      name: "Mekanik",
      notion_value: "Mekanik",
      drive_folder_id: "folder-02",
    },
  ],
  milestones: [
    {
      id: "ms-1",
      name: "Kritik Tasarım İncelemesi",
      due: "2026-10-15",
      notion_value: "KDR",
    },
  ],
  doc_types: {
    report: [".pdf"],
  },
};

export const validDataSourceSchema: DataSourceSchema = {
  properties: {
    Görev: { id: "p1", name: "Görev", type: "title" },
    Durum: {
      id: "p2",
      name: "Durum",
      type: "status",
      status: {
        options: [
          { id: "opt-todo-1", name: "Yapılacak" },
          { id: "opt-todo-2", name: "Planlandı" },
          { id: "opt-active-1", name: "Devam ediyor" },
          { id: "opt-done-1", name: "Tamamlandı" },
        ],
        groups: [
          {
            id: "grp-1",
            name: "To-do",
            option_ids: ["opt-todo-1", "opt-todo-2"],
          },
          {
            id: "grp-2",
            name: "In progress",
            option_ids: ["opt-active-1"],
          },
          {
            id: "grp-3",
            name: "Complete",
            option_ids: ["opt-done-1"],
          },
        ],
      },
    },
    Birim: { id: "p3", name: "Birim", type: "select" },
    "Bitiş Tarihi": { id: "p4", name: "Bitiş Tarihi", type: "date" },
    Tıkalı: { id: "p5", name: "Tıkalı", type: "checkbox" },
    "Tıkanıklık Nedeni": {
      id: "p6",
      name: "Tıkanıklık Nedeni",
      type: "rich_text",
    },
    "Kilometre Taşı": { id: "p7", name: "Kilometre Taşı", type: "select" },
    "Sıradaki Eylem": { id: "p8", name: "Sıradaki Eylem", type: "checkbox" },
  },
};

export const schemaWithWrongType: DataSourceSchema = {
  properties: {
    Görev: { id: "p1", name: "Görev", type: "title" },
    Durum: { id: "p2", name: "Durum", type: "select" }, // Wrong type: select instead of status
    Birim: { id: "p3", name: "Birim", type: "select" },
  },
};

export const schemaMissingRequired: DataSourceSchema = {
  properties: {
    Görev: { id: "p1", name: "Görev", type: "title" },
    // Missing Durum and Birim
  },
};

export const pageFixtures = {
  // 1. Multi-segment title
  multiSegmentTitle: {
    object: "page",
    id: "page-multi-title",
    url: "https://notion.so/page-multi-title",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T10:00:00.000Z",
    properties: {
      Görev: {
        id: "p1",
        type: "title",
        title: [
          { plain_text: "Motor " },
          { plain_text: "mount " },
          { plain_text: "v2" },
        ],
      },
      Durum: {
        id: "p2",
        type: "status",
        status: { id: "opt-active-1", name: "Devam ediyor" },
      },
      Birim: {
        id: "p3",
        type: "select",
        select: { id: "d1", name: "Mekanik" },
      },
    },
  } as unknown as PageObjectResponse,

  // 2. Multi-segment rich_text (blocker note)
  multiSegmentRichText: {
    object: "page",
    id: "page-multi-rt",
    url: "https://notion.so/page-multi-rt",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T10:05:00.000Z",
    properties: {
      Görev: {
        id: "p1",
        type: "title",
        title: [{ plain_text: "Motor testing" }],
      },
      Durum: {
        id: "p2",
        type: "status",
        status: { id: "opt-active-1", name: "Devam ediyor" },
      },
      Birim: {
        id: "p3",
        type: "select",
        select: { id: "d1", name: "Mekanik" },
      },
      Tıkalı: {
        id: "p5",
        type: "checkbox",
        checkbox: true,
      },
      "Tıkanıklık Nedeni": {
        id: "p6",
        type: "rich_text",
        rich_text: [
          { plain_text: "Waiting for " },
          { plain_text: "parts" },
        ],
      },
    },
  } as unknown as PageObjectResponse,

  // 3. Missing optional properties
  missingOptionalProps: {
    object: "page",
    id: "page-minimal",
    url: "https://notion.so/page-minimal",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T10:10:00.000Z",
    properties: {
      Görev: {
        id: "p1",
        type: "title",
        title: [{ plain_text: "Minimal task" }],
      },
      Durum: {
        id: "p2",
        type: "status",
        status: { id: "opt-todo-1", name: "Yapılacak" },
      },
      Birim: {
        id: "p3",
        type: "select",
        select: { id: "d0", name: "Genel / Yönetim" },
      },
      // No due, blocked, blocker_note, milestone, next
    },
  } as unknown as PageObjectResponse,

  // 4. Unknown department
  unknownDepartment: {
    object: "page",
    id: "page-unknown-dept",
    url: "https://notion.so/page-unknown-dept",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T10:15:00.000Z",
    properties: {
      Görev: {
        id: "p1",
        type: "title",
        title: [{ plain_text: "Unknown dept task" }],
      },
      Durum: {
        id: "p2",
        type: "status",
        status: { id: "opt-active-1", name: "Devam ediyor" },
      },
      Birim: {
        id: "p3",
        type: "select",
        select: { id: "d99", name: "Dış Paydaş" }, // Not in config
      },
    },
  } as unknown as PageObjectResponse,

  // 5. Standard page (all properties present)
  standardPage: {
    object: "page",
    id: "page-standard",
    url: "https://notion.so/page-standard",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T10:20:00.000Z",
    properties: {
      Görev: {
        id: "p1",
        type: "title",
        title: [{ plain_text: "Assemble avionics harness" }],
      },
      Durum: {
        id: "p2",
        type: "status",
        status: { id: "opt-active-1", name: "Devam ediyor" },
      },
      Birim: {
        id: "p3",
        type: "select",
        select: { id: "d1", name: "Aviyonik" },
      },
      "Bitiş Tarihi": {
        id: "p4",
        type: "date",
        date: { start: "2026-10-01" },
      },
      Tıkalı: {
        id: "p5",
        type: "checkbox",
        checkbox: true,
      },
      "Tıkanıklık Nedeni": {
        id: "p6",
        type: "rich_text",
        rich_text: [{ plain_text: "Waiting for connectors" }],
      },
      "Kilometre Taşı": {
        id: "p7",
        type: "select",
        select: { id: "m1", name: "KDR" },
      },
      "Sıradaki Eylem": {
        id: "p8",
        type: "checkbox",
        checkbox: true,
      },
    },
  } as unknown as PageObjectResponse,
};
