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
    Durum: { id: "p2", name: "Durum", type: "number" }, // Wrong type: neither status nor select
    Birim: { id: "p3", name: "Birim", type: "select" },
  },
};

export const schemaMissingRequired: DataSourceSchema = {
  properties: {
    Görev: { id: "p1", name: "Görev", type: "title" },
    // Missing Durum and Birim
  },
};

export const buminProjectConfig: ProjectConfig = {
  project: {
    name: "BUMIN-2",
    deadline: "2026-12-31",
    deliverable: "2 uçan prototip",
    timezone: "Europe/Istanbul",
    stale_days: 3,
  },
  notion: {
    tasks_data_source_id: "ds-bumin-kanban",
    row_filter: {
      property: "Grup",
      equals: "Görev",
    },
    properties: {
      title: "Name",
      status: "Durum",
      department: "Departman",
      blocker_note: "Engel",
      priority: "Öncelik",
      order: "Sıra",
    },
    blocked_statuses: ["BLOKE"],
    status_groups: {
      todo: ["BAŞLANMADI", "HAZIR"],
      active: ["AKTİF", "BLOKE", "DOĞRULAMAYA HAZIR"],
      done: ["DOĞRULANDI", "KAPALI"],
    },
  },
  drive: {
    root_folder_id: "drive-bumin-root",
  },
  departments: [
    {
      id: "00",
      name: "Koordinasyon",
      notion_value: "00 Koordinasyon",
      drive_folder_id: "drive-folder-00",
    },
    {
      id: "01",
      name: "Avionik",
      notion_value: "01 Avionik",
      drive_folder_id: "drive-folder-01",
    },
  ],
  doc_types: {
    test: ["^NCR-", "^OI-"],
    report: ["^HO-", "^CHG-", "^RB-", "^REQUIREMENTS_"],
    decision: ["^WP-.*_DECISION"],
  },
};

export const buminDataSourceSchema: DataSourceSchema = {
  properties: {
    Name: { id: "p-name", name: "Name", type: "title" },
    Durum: {
      id: "p-durum",
      name: "Durum",
      type: "select",
      select: {
        options: [
          { id: "opt-1", name: "BAŞLANMADI" },
          { id: "opt-2", name: "HAZIR" },
          { id: "opt-3", name: "AKTİF" },
          { id: "opt-4", name: "BLOKE" },
          { id: "opt-5", name: "DOĞRULAMAYA HAZIR" },
          { id: "opt-6", name: "DOĞRULANDI" },
          { id: "opt-7", name: "KAPALI" },
        ],
      },
    },
    Departman: {
      id: "p-dept",
      name: "Departman",
      type: "select",
      select: {
        options: [
          { id: "d-00", name: "00 Koordinasyon" },
          { id: "d-01", name: "01 Avionik" },
        ],
      },
    },
    Grup: {
      id: "p-grup",
      name: "Grup",
      type: "select",
      select: {
        options: [
          { id: "g-wp", name: "Work Package" },
          { id: "g-gorev", name: "Görev" },
          { id: "g-gate", name: "Gate" },
        ],
      },
    },
    Engel: { id: "p-engel", name: "Engel", type: "rich_text" },
    Öncelik: {
      id: "p-oncelik",
      name: "Öncelik",
      type: "select",
      select: {
        options: [
          { id: "pr-0", name: "P0-Kritik" },
          { id: "pr-1", name: "P1-Yüksek" },
          { id: "pr-2", name: "P2-Normal" },
          { id: "pr-3", name: "P3-Sonra" },
        ],
      },
    },
    Sıra: { id: "p-sira", name: "Sıra", type: "number" },
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

export const buminPageFixtures = {
  // Task with Durum = BLOKE and Engel filled
  blokePage: {
    object: "page",
    id: "page-bumin-bloke",
    url: "https://notion.so/page-bumin-bloke",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T12:00:00.000Z",
    properties: {
      Name: {
        id: "p-name",
        type: "title",
        title: [{ plain_text: "Motor sürücüsü entegrasyonu" }],
      },
      Durum: {
        id: "p-durum",
        type: "select",
        select: { id: "opt-4", name: "BLOKE" },
      },
      Departman: {
        id: "p-dept",
        type: "select",
        select: { id: "d-01", name: "01 Avionik" },
      },
      Grup: {
        id: "p-grup",
        type: "select",
        select: { id: "g-gorev", name: "Görev" },
      },
      Engel: {
        id: "p-engel",
        type: "rich_text",
        rich_text: [{ plain_text: "Motor sürücüsü arızalı, yenisi bekleniyor" }],
      },
      Öncelik: {
        id: "p-oncelik",
        type: "select",
        select: { id: "pr-0", name: "P0-Kritik" },
      },
      Sıra: {
        id: "p-sira",
        type: "number",
        number: 1,
      },
    },
  } as unknown as PageObjectResponse,

  // Task with Durum = AKTİF and Engel filled with "Yok. ..."
  aktifPage: {
    object: "page",
    id: "page-bumin-aktif",
    url: "https://notion.so/page-bumin-aktif",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T12:05:00.000Z",
    properties: {
      Name: {
        id: "p-name",
        type: "title",
        title: [{ plain_text: "Uçuş kontrol kartı testi" }],
      },
      Durum: {
        id: "p-durum",
        type: "select",
        select: { id: "opt-3", name: "AKTİF" },
      },
      Departman: {
        id: "p-dept",
        type: "select",
        select: { id: "d-01", name: "01 Avionik" },
      },
      Grup: {
        id: "p-grup",
        type: "select",
        select: { id: "g-gorev", name: "Görev" },
      },
      Engel: {
        id: "p-engel",
        type: "rich_text",
        rich_text: [{ plain_text: "Yok. Testler devam ediyor." }],
      },
      Öncelik: {
        id: "p-oncelik",
        type: "select",
        select: { id: "pr-1", name: "P1-Yüksek" },
      },
      Sıra: {
        id: "p-sira",
        type: "number",
        number: 2.5,
      },
    },
  } as unknown as PageObjectResponse,

  // Task with Durum = BAŞLANMADI
  baslanmadiPage: {
    object: "page",
    id: "page-bumin-baslanmadi",
    url: "https://notion.so/page-bumin-baslanmadi",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T12:10:00.000Z",
    properties: {
      Name: {
        id: "p-name",
        type: "title",
        title: [{ plain_text: "Telemetri modülü montajı" }],
      },
      Durum: {
        id: "p-durum",
        type: "select",
        select: { id: "opt-1", name: "BAŞLANMADI" },
      },
      Departman: {
        id: "p-dept",
        type: "select",
        select: { id: "d-01", name: "01 Avionik" },
      },
      Grup: {
        id: "p-grup",
        type: "select",
        select: { id: "g-gorev", name: "Görev" },
      },
      Engel: {
        id: "p-engel",
        type: "rich_text",
        rich_text: [{ plain_text: "Yok." }],
      },
      Öncelik: {
        id: "p-oncelik",
        type: "select",
        select: { id: "pr-2", name: "P2-Normal" },
      },
      Sıra: {
        id: "p-sira",
        type: "number",
        number: 5,
      },
    },
  } as unknown as PageObjectResponse,

  // Work Package row (Grup != Görev)
  workPackageRow: {
    object: "page",
    id: "page-bumin-wp",
    url: "https://notion.so/page-bumin-wp",
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-27T12:15:00.000Z",
    properties: {
      Name: {
        id: "p-name",
        type: "title",
        title: [{ plain_text: "WP-01 Avionik Paketi" }],
      },
      Durum: {
        id: "p-durum",
        type: "select",
        select: { id: "opt-3", name: "AKTİF" },
      },
      Departman: {
        id: "p-dept",
        type: "select",
        select: { id: "d-01", name: "01 Avionik" },
      },
      Grup: {
        id: "p-grup",
        type: "select",
        select: { id: "g-wp", name: "Work Package" },
      },
    },
  } as unknown as PageObjectResponse,
};
