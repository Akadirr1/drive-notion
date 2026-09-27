import { describe, it, expect, vi } from "vitest";
import {
  mapPage,
  validateSchema,
  deriveStatusGroups,
  resolveStatusGroup,
  buildRowFilter,
  PropertyConfigError,
} from "@/server/integrations/notion/map-page";
import { diffTask, hasTaskChanged } from "@/server/integrations/notion/diff-task";
import {
  testProjectConfig,
  validDataSourceSchema,
  schemaWithWrongType,
  schemaMissingRequired,
  pageFixtures,
  buminProjectConfig,
  buminDataSourceSchema,
  buminPageFixtures,
} from "./fixtures/notion-pages";

describe("validateSchema", () => {
  it("passes without error for a valid schema with status property", () => {
    expect(() =>
      validateSchema(validDataSourceSchema, testProjectConfig)
    ).not.toThrow();
  });

  it("throws PropertyConfigError when a required property is missing", () => {
    expect(() =>
      validateSchema(schemaMissingRequired, testProjectConfig)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(schemaMissingRequired, testProjectConfig);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("Durum");
      expect((err as Error).message).toContain("config/project.yaml");
    }
  });

  it("throws PropertyConfigError when a property has the wrong type", () => {
    expect(() =>
      validateSchema(schemaWithWrongType, testProjectConfig)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(schemaWithWrongType, testProjectConfig);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("expected type \"status\" or \"select\"");
      expect((err as Error).message).toContain("found \"number\"");
    }
  });

  it("does not throw when an optional property is missing from schema", () => {
    const schemaWithoutOptional = {
      properties: {
        Görev: { id: "p1", name: "Görev", type: "title" },
        Durum: {
          id: "p2",
          name: "Durum",
          type: "status",
          status: {
            options: [{ id: "opt-1", name: "Yapılacak" }],
            groups: [{ id: "g1", name: "To-do", option_ids: ["opt-1"] }],
          },
        },
        Birim: { id: "p3", name: "Birim", type: "select" },
        // Optional properties omitted
      },
    };
    expect(() =>
      validateSchema(schemaWithoutOptional, testProjectConfig)
    ).not.toThrow();
  });

  it("select status with full groups passes", () => {
    expect(() =>
      validateSchema(buminDataSourceSchema, buminProjectConfig)
    ).not.toThrow();
  });

  it("select without status_groups fails", () => {
    const configWithoutGroups = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        status_groups: undefined,
      },
    };

    expect(() =>
      validateSchema(buminDataSourceSchema, configWithoutGroups)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(buminDataSourceSchema, configWithoutGroups);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("notion.status_groups is required");
      expect((err as Error).message).toContain("config/project.yaml");
    }
  });

  it("an unlisted option fails and is named", () => {
    const configWithUnlisted = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        status_groups: {
          todo: ["BAŞLANMADI", "HAZIR"],
          active: ["AKTİF", "BLOKE", "DOĞRULAMAYA HAZIR"],
          done: ["DOĞRULANDI"], // "KAPALI" omitted
        },
      },
    };

    expect(() =>
      validateSchema(buminDataSourceSchema, configWithUnlisted)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(buminDataSourceSchema, configWithUnlisted);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("KAPALI");
      expect((err as Error).message).toContain("config/project.yaml");
    }
  });

  it("a duplicated option fails and is named", () => {
    const configWithDuplicated = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        status_groups: {
          todo: ["BAŞLANMADI", "HAZIR", "AKTİF"], // AKTİF duplicated in todo and active
          active: ["AKTİF", "BLOKE", "DOĞRULAMAYA HAZIR"],
          done: ["DOĞRULANDI", "KAPALI"],
        },
      },
    };

    expect(() =>
      validateSchema(buminDataSourceSchema, configWithDuplicated)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(buminDataSourceSchema, configWithDuplicated);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("AKTİF");
      expect((err as Error).message).toContain("config/project.yaml");
    }
  });

  it("an unknown blocked_statuses value fails", () => {
    const configWithBadBlocked = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        blocked_statuses: ["NONEXISTENT_STATUS"],
      },
    };

    expect(() =>
      validateSchema(buminDataSourceSchema, configWithBadBlocked)
    ).toThrowError(PropertyConfigError);

    try {
      validateSchema(buminDataSourceSchema, configWithBadBlocked);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("NONEXISTENT_STATUS");
      expect((err as Error).message).toContain("config/project.yaml");
    }
  });

  it("row_filter with a missing property, wrong type or unknown option fails", () => {
    // 1. Missing property
    const configMissingFilterProp = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        row_filter: { property: "NonExistentProp", equals: "Görev" },
      },
    };
    expect(() =>
      validateSchema(buminDataSourceSchema, configMissingFilterProp)
    ).toThrowError(/NonExistentProp.*config\/project\.yaml/);

    // 2. Wrong type
    const configWrongTypeFilterProp = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        row_filter: { property: "Engel", equals: "Görev" }, // Engel is rich_text, not select
      },
    };
    expect(() =>
      validateSchema(buminDataSourceSchema, configWrongTypeFilterProp)
    ).toThrowError(/expected type "select" but found "rich_text"/);

    // 3. Unknown option
    const configUnknownOptionFilterProp = {
      ...buminProjectConfig,
      notion: {
        ...buminProjectConfig.notion,
        row_filter: { property: "Grup", equals: "UnknownGroup" },
      },
    };
    expect(() =>
      validateSchema(buminDataSourceSchema, configUnknownOptionFilterProp)
    ).toThrowError(/UnknownGroup.*config\/project\.yaml/);
  });
});

describe("deriveStatusGroups", () => {
  it("maps 1st group -> todo, 2nd group -> active, 3rd group -> done", () => {
    const groups = deriveStatusGroups(validDataSourceSchema, "Durum");
    expect(groups.get("Yapılacak")).toBe("todo");
    expect(groups.get("Planlandı")).toBe("todo");
    expect(groups.get("Devam ediyor")).toBe("active");
    expect(groups.get("Tamamlandı")).toBe("done");
  });

  it("returns empty map for select status property", () => {
    const groups = deriveStatusGroups(buminDataSourceSchema, "Durum");
    expect(groups.size).toBe(0);
  });
});

describe("resolveStatusGroup (Amendment B)", () => {
  const schemaGroups = new Map<string, "todo" | "active" | "done">([
    ["Yapılacak", "todo"],
    ["Devam ediyor", "active"],
    ["Tamamlandı", "done"],
  ]);

  it("without config overrides: resolves directly from schema groups", () => {
    const warn = vi.fn();
    expect(resolveStatusGroup("Yapılacak", schemaGroups, undefined, warn)).toBe(
      "todo"
    );
    expect(
      resolveStatusGroup("Devam ediyor", schemaGroups, undefined, warn)
    ).toBe("active");
    expect(
      resolveStatusGroup("Tamamlandı", schemaGroups, undefined, warn)
    ).toBe("done");
    expect(warn).not.toHaveBeenCalled();
  });

  it("with config overrides: overrides only listed options", () => {
    const warn = vi.fn();
    const configOverrides = {
      active: ["Yapılacak"], // override Yapılacak to active
    };

    expect(
      resolveStatusGroup("Yapılacak", schemaGroups, configOverrides, warn)
    ).toBe("active");
    expect(warn).not.toHaveBeenCalled();
  });

  it("with config overrides: unlisted option falls back to schema group with warning", () => {
    const warn = vi.fn();
    const configOverrides = {
      active: ["Özel Durum"],
    };

    // 'Yapılacak' is not listed in configOverrides, but exists in schemaGroups as 'todo'
    const result = resolveStatusGroup(
      "Yapılacak",
      schemaGroups,
      configOverrides,
      warn
    );
    expect(result).toBe("todo");
    expect(warn).toHaveBeenCalledWith({
      event: "notion_status_fallback_to_schema",
      status: "Yapılacak",
      schemaGroup: "todo",
    });
  });

  it("unlisted option missing from schema too warns and falls back to todo", () => {
    const warn = vi.fn();
    const configOverrides = {
      active: ["Özel Durum"],
    };

    const result = resolveStatusGroup(
      "Bilinmeyen Durum",
      schemaGroups,
      configOverrides,
      warn
    );
    expect(result).toBe("todo");
    expect(warn).toHaveBeenCalledWith({
      event: "notion_status_unknown",
      status: "Bilinmeyen Durum",
      fallback: "todo",
    });
  });

  it("empty status maps to todo without a warning", () => {
    const warn = vi.fn();
    expect(resolveStatusGroup("", schemaGroups, undefined, warn)).toBe("todo");
    expect(resolveStatusGroup("", schemaGroups, { todo: ["A"] }, warn)).toBe("todo");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("buildRowFilter", () => {
  it("builds query filter when row_filter is provided", () => {
    expect(buildRowFilter({ property: "Grup", equals: "Görev" })).toEqual({
      property: "Grup",
      select: { equals: "Görev" },
    });
  });

  it("returns undefined when row_filter is not provided", () => {
    expect(buildRowFilter(undefined)).toBeUndefined();
  });
});

describe("mapPage", () => {
  const schemaGroups = deriveStatusGroups(validDataSourceSchema, "Durum");

  it("1. joins all multi-segment title plain_text segments", () => {
    const warn = vi.fn();
    const snapshot = mapPage(
      pageFixtures.multiSegmentTitle,
      testProjectConfig,
      schemaGroups,
      warn
    );
    expect(snapshot.title).toBe("Motor mount v2");
    expect(snapshot.status).toBe("Devam ediyor");
    expect(snapshot.statusGroup).toBe("active");
    expect(snapshot.departmentId).toBe("02");
  });

  it("2. joins all multi-segment rich_text plain_text segments for blockerNote", () => {
    const warn = vi.fn();
    const snapshot = mapPage(
      pageFixtures.multiSegmentRichText,
      testProjectConfig,
      schemaGroups,
      warn
    );
    expect(snapshot.blockerNote).toBe("Waiting for parts");
    expect(snapshot.blocked).toBe(1);
  });

  it("3. sets default values when optional properties are missing", () => {
    const warn = vi.fn();
    const snapshot = mapPage(
      pageFixtures.missingOptionalProps,
      testProjectConfig,
      schemaGroups,
      warn
    );
    expect(snapshot.title).toBe("Minimal task");
    expect(snapshot.dueDate).toBeNull();
    expect(snapshot.blocked).toBe(0);
    expect(snapshot.blockerNote).toBeNull();
    expect(snapshot.milestoneId).toBeNull();
    expect(snapshot.isNext).toBe(0);
    expect(snapshot.priorityRank).toBeNull();
    expect(snapshot.sortOrder).toBeNull();
  });

  it("4. sets departmentId to null and warns on unknown department", () => {
    const warn = vi.fn();
    const snapshot = mapPage(
      pageFixtures.unknownDepartment,
      testProjectConfig,
      schemaGroups,
      warn
    );
    expect(snapshot.departmentId).toBeNull();
    expect(warn).toHaveBeenCalledWith({
      event: "notion_unknown_department",
      value: "Dış Paydaş",
      pageId: pageFixtures.unknownDepartment.id,
    });
  });

  it("5. correctly maps a standard page with all properties", () => {
    const warn = vi.fn();
    const snapshot = mapPage(
      pageFixtures.standardPage,
      testProjectConfig,
      schemaGroups,
      warn
    );
    expect(snapshot.pageId).toBe("page-standard");
    expect(snapshot.title).toBe("Assemble avionics harness");
    expect(snapshot.status).toBe("Devam ediyor");
    expect(snapshot.statusGroup).toBe("active");
    expect(snapshot.departmentId).toBe("01");
    expect(snapshot.dueDate).toBe("2026-10-01");
    expect(snapshot.blocked).toBe(1);
    expect(snapshot.blockerNote).toBe("Waiting for connectors");
    expect(snapshot.milestoneId).toBe("ms-1");
    expect(snapshot.isNext).toBe(1);
    expect(snapshot.url).toBe("https://notion.so/page-standard");
    expect(snapshot.archived).toBe(0);
  });

  it("6. select status is read", () => {
    const warn = vi.fn();
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const snapshot = mapPage(
      buminPageFixtures.aktifPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snapshot.status).toBe("AKTİF");
    expect(snapshot.statusGroup).toBe("active");
  });

  it("7. Durum BLOKE → blocked = 1 with blockerNote", () => {
    const warn = vi.fn();
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const snapshot = mapPage(
      buminPageFixtures.blokePage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snapshot.status).toBe("BLOKE");
    expect(snapshot.statusGroup).toBe("active");
    expect(snapshot.blocked).toBe(1);
    expect(snapshot.blockerNote).toBe("Motor sürücüsü arızalı, yenisi bekleniyor");
  });

  it("8. any other Durum → blocked = 0 and blockerNote null", () => {
    const warn = vi.fn();
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const snapshot = mapPage(
      buminPageFixtures.aktifPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snapshot.status).toBe("AKTİF");
    expect(snapshot.blocked).toBe(0);
    expect(snapshot.blockerNote).toBeNull();
  });

  it("9. priority_rank and sort_order are mapped", () => {
    const warn = vi.fn();
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();

    // blokePage has Öncelik: "P0-Kritik" (index 0) and Sıra: 1
    const snap1 = mapPage(
      buminPageFixtures.blokePage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snap1.priorityRank).toBe(0);
    expect(snap1.sortOrder).toBe(1);

    // aktifPage has Öncelik: "P1-Yüksek" (index 1) and Sıra: 2.5
    const snap2 = mapPage(
      buminPageFixtures.aktifPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snap2.priorityRank).toBe(1);
    expect(snap2.sortOrder).toBe(2.5);

    // baslanmadiPage has Öncelik: "P2-Normal" (index 2) and Sıra: 5
    const snap3 = mapPage(
      buminPageFixtures.baslanmadiPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    expect(snap3.priorityRank).toBe(2);
    expect(snap3.sortOrder).toBe(5);
  });
});

describe("diffTask", () => {
  const schemaGroups = deriveStatusGroups(validDataSourceSchema, "Durum");
  const warn = vi.fn();

  const baseSnapshot = mapPage(
    pageFixtures.standardPage,
    testProjectConfig,
    schemaGroups,
    warn
  );

  it("1. new task with statusGroup = active emits status:active", () => {
    const activeTask = { ...baseSnapshot, statusGroup: "active" as const };
    const events = diffTask(null, activeTask);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("status:active");
    expect(events[0].externalId).toBe(baseSnapshot.pageId);
    const payload = JSON.parse(events[0].payload);
    expect(payload.before).toBeNull();
    expect(payload.after.title).toBe(baseSnapshot.title);
    expect(payload.after.departmentId).toBe(baseSnapshot.departmentId);
    expect(payload.after.url).toBe(baseSnapshot.url);
  });

  it("2. new task with statusGroup = done emits status:done", () => {
    const doneTask = { ...baseSnapshot, statusGroup: "done" as const };
    const events = diffTask(null, doneTask);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("status:done");
  });

  it("3. new task with statusGroup = todo emits nothing", () => {
    const todoTask = { ...baseSnapshot, statusGroup: "todo" as const };
    const events = diffTask(null, todoTask);
    expect(events).toEqual([]);
  });

  it("4. statusGroup changed from todo to active emits status:active", () => {
    const before = { ...baseSnapshot, statusGroup: "todo" as const };
    const after = { ...baseSnapshot, statusGroup: "active" as const };
    const events = diffTask(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("status:active");
    const payload = JSON.parse(events[0].payload);
    expect(payload.before.statusGroup).toBe("todo");
    expect(payload.after.statusGroup).toBe("active");
  });

  it("5. blocked changed from 0 to 1 emits blocked:true", () => {
    const before = { ...baseSnapshot, blocked: 0 };
    const after = { ...baseSnapshot, blocked: 1, blockerNote: "Waiting on glue" };
    const events = diffTask(before, after);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("blocked:true");
    const payload = JSON.parse(events[0].payload);
    expect(payload.before.blocked).toBe(0);
    expect(payload.after.blocked).toBe(1);
    expect(payload.after.blockerNote).toBe("Waiting on glue");
  });

  it("6. status and blocked changed simultaneously emits both events", () => {
    const before = {
      ...baseSnapshot,
      statusGroup: "todo" as const,
      blocked: 0,
    };
    const after = {
      ...baseSnapshot,
      statusGroup: "active" as const,
      blocked: 1,
    };
    const events = diffTask(before, after);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind)).toEqual(["status:active", "blocked:true"]);
  });

  it("7. completely unchanged snapshot emits nothing (no-op)", () => {
    const events = diffTask(baseSnapshot, { ...baseSnapshot });
    expect(events).toEqual([]);
  });

  it("8. all events include title, departmentId, and url in after payload", () => {
    const before = { ...baseSnapshot, statusGroup: "todo" as const };
    const after = { ...baseSnapshot, statusGroup: "active" as const };
    const [event] = diffTask(before, after);
    const payload = JSON.parse(event.payload);
    expect(payload.after.title).toBe(after.title);
    expect(payload.after.departmentId).toBe(after.departmentId);
    expect(payload.after.url).toBe(after.url);
  });

  it("9. AKTİF → BLOKE emits only blocked:true", () => {
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const aktifSnap = mapPage(
      buminPageFixtures.aktifPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    const blokeSnap = {
      ...aktifSnap,
      status: "BLOKE",
      statusGroup: "active" as const,
      blocked: 1,
      blockerNote: "Motor sürücüsü arızalı",
    };

    const events = diffTask(aktifSnap, blokeSnap);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("blocked:true");
    const payload = JSON.parse(events[0].payload);
    expect(payload.after.blockerNote).toBe("Motor sürücüsü arızalı");
  });

  it("10. BAŞLANMADI → BLOKE emits status:active and blocked:true", () => {
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const baslanmadiSnap = mapPage(
      buminPageFixtures.baslanmadiPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    const blokeSnap = {
      ...baslanmadiSnap,
      status: "BLOKE",
      statusGroup: "active" as const,
      blocked: 1,
      blockerNote: "Motor sürücüsü arızalı",
    };

    const events = diffTask(baslanmadiSnap, blokeSnap);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind)).toEqual(["status:active", "blocked:true"]);
  });

  it("11. a priority change emits nothing but counts as a change", () => {
    const buminSchemaGroups = new Map<string, "todo" | "active" | "done">();
    const snapBefore = mapPage(
      buminPageFixtures.aktifPage,
      buminProjectConfig,
      buminSchemaGroups,
      warn,
      buminDataSourceSchema
    );
    const snapAfter = {
      ...snapBefore,
      priorityRank: (snapBefore.priorityRank ?? 0) + 1,
    };

    // Emits nothing
    expect(diffTask(snapBefore, snapAfter)).toEqual([]);
    // But counts as a change
    expect(hasTaskChanged(snapBefore, snapAfter)).toBe(true);
  });
});
