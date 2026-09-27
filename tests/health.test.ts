import { describe, it, expect } from "vitest";
import {
  computeHealth,
  IMPLEMENTED_SOURCES,
  type SyncStateRow,
} from "@/server/queries/health";

function makeRow(
  overrides: Partial<SyncStateRow> & { source: string },
): SyncStateRow {
  return {
    cursor: null,
    seeded: 0,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  };
}

describe("computeHealth", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  const minutesAgo = (mins: number) =>
    new Date(now.getTime() - mins * 60 * 1000).toISOString();

  it("1. No DB (empty rows): ok: false, both sources implemented: false, worker.lastLoopAt: null", () => {
    const result = computeHealth([], now, []);
    expect(result.ok).toBe(false);
    expect(result.sources.notion.implemented).toBe(false);
    expect(result.sources.drive.implemented).toBe(false);
    expect(result.worker.lastLoopAt).toBeNull();
  });

  it("2. Worker running, no sources implemented: ok: true", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: null }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, []);
    expect(result.ok).toBe(true);
    expect(result.worker.lastLoopAt).toBe(minutesAgo(2));
    expect(result.sources.notion.implemented).toBe(false);
    expect(result.sources.drive.implemented).toBe(false);
  });

  it("3. Worker stale (> 30 min): ok: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: null }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(35) }),
    ];
    const result = computeHealth(rows, now, []);
    expect(result.ok).toBe(false);
  });

  it("4. One source implemented and fresh: ok: true, notion.implemented: true, drive.implemented: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: minutesAgo(5) }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(true);
    expect(result.sources.notion.implemented).toBe(true);
    expect(result.sources.drive.implemented).toBe(false);
  });

  it("5. One source implemented but stale (> 30 min): ok: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: minutesAgo(40) }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(false);
  });

  it("6. Both sources implemented and fresh: ok: true", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: minutesAgo(10) }),
      makeRow({ source: "drive", lastSuccessAt: minutesAgo(15) }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion", "drive"]);
    expect(result.ok).toBe(true);
  });

  it("7. Source with error but recent success: ok: true, lastError and lastErrorAt populated", () => {
    const rows: SyncStateRow[] = [
      makeRow({
        source: "notion",
        lastSuccessAt: minutesAgo(5),
        lastError: "timeout",
        lastErrorAt: minutesAgo(3),
      }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(true);
    expect(result.sources.notion.lastError).toBe("timeout");
    expect(result.sources.notion.lastErrorAt).toBe(minutesAgo(3));
  });

  it("8. Source with error and stale success: ok: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({
        source: "notion",
        lastSuccessAt: minutesAgo(40),
        lastError: "timeout",
        lastErrorAt: minutesAgo(3),
      }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(false);
  });

  it("9. Implemented source with no success ever: ok: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: null }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(false);
  });

  it("10. Implemented source with only errors, no success: ok: false", () => {
    const rows: SyncStateRow[] = [
      makeRow({
        source: "notion",
        lastSuccessAt: null,
        lastError: "auth failed",
        lastErrorAt: minutesAgo(2),
      }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now, ["notion"]);
    expect(result.ok).toBe(false);
  });

  it("verifies IMPLEMENTED_SOURCES contains notion and drive in Phase 4", () => {
    expect(IMPLEMENTED_SOURCES).toEqual(["notion", "drive"]);
  });

  it("notion and drive sources without recent success make ok = false when using default IMPLEMENTED_SOURCES", () => {
    const rows: SyncStateRow[] = [
      makeRow({ source: "notion", lastSuccessAt: null }),
      makeRow({ source: "drive", lastSuccessAt: null }),
      makeRow({ source: "worker", lastSuccessAt: minutesAgo(2) }),
    ];
    const result = computeHealth(rows, now);
    expect(result.ok).toBe(false);
    expect(result.sources.notion.implemented).toBe(true);
    expect(result.sources.drive.implemented).toBe(true);
  });
});
