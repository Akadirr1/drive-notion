import { describe, it, expect } from "vitest";
import { normalizeRawEvent } from "@/server/events/normalize";
import { rawEventFixtures } from "./fixtures/notion-raw-events";

describe("normalizeRawEvent", () => {
  it("1. todoToActive maps to TASK_STARTED", () => {
    const f = rawEventFixtures.todoToActive;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_STARTED");
    expect(result!.source).toBe("notion");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.occurredAt).toBe(f.occurredAt);
    expect(result!.rawEventId).toBe(f.id);
    expect(result!.subjectTitle).toBe("Design motor mount");
    expect(result!.departmentId).toBe("01");
    expect(result!.url).toBe("https://notion.so/page-001");
    expect(result!.detail).toBeNull();
    expect(result!.docType).toBeNull();
  });

  it("2. doneToActive (re-opened task) maps to TASK_STARTED", () => {
    const f = rawEventFixtures.doneToActive;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_STARTED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Revise wiring diagram");
    expect(result!.departmentId).toBe("02");
  });

  it("3. activeToDone maps to TASK_COMPLETED", () => {
    const f = rawEventFixtures.activeToDone;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_COMPLETED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Order batteries");
    expect(result!.departmentId).toBe("00");
  });

  it("4. todoToDone (direct skip to done) maps to TASK_COMPLETED", () => {
    const f = rawEventFixtures.todoToDone;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_COMPLETED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Book test site");
  });

  it("5. unblockedToBlocked maps to TASK_BLOCKED with detail = blocker note", () => {
    const f = rawEventFixtures.unblockedToBlocked;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_BLOCKED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Assemble avionics");
    expect(result!.detail).toBe("Waiting for PCB delivery");
  });

  it("6. blockedToUnblocked maps to TASK_UNBLOCKED with detail = null", () => {
    const f = rawEventFixtures.blockedToUnblocked;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_UNBLOCKED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Test GPS module");
    expect(result!.detail).toBeNull();
  });

  it("7. newTaskActive (before = null) maps to TASK_STARTED", () => {
    const f = rawEventFixtures.newTaskActive;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_STARTED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Calibrate ESCs");
    expect(result!.departmentId).toBe("02");
  });

  it("8. newTaskDone (before = null) maps to TASK_COMPLETED", () => {
    const f = rawEventFixtures.newTaskDone;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_COMPLETED");
    expect(result!.sourceId).toBe(f.externalId);
    expect(result!.subjectTitle).toBe("Register team");
    expect(result!.departmentId).toBe("00");
  });

  it("9. statusTodo (kind: 'status:todo') returns null (not a semantic event)", () => {
    const f = rawEventFixtures.statusTodo;
    const result = normalizeRawEvent(f);
    expect(result).toBeNull();
  });

  it("10. noDepartment produces event with departmentId = null", () => {
    const f = rawEventFixtures.noDepartment;
    const result = normalizeRawEvent(f);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TASK_STARTED");
    expect(result!.subjectTitle).toBe("Unassigned task");
    expect(result!.departmentId).toBeNull();
  });

  it("11. non-notion source returns null", () => {
    const raw = {
      ...rawEventFixtures.todoToActive,
      source: "drive",
    };
    expect(normalizeRawEvent(raw)).toBeNull();
  });

  it("12. malformed JSON payload returns null", () => {
    const raw = {
      ...rawEventFixtures.todoToActive,
      payload: "invalid-json",
    };
    expect(normalizeRawEvent(raw)).toBeNull();
  });
});
