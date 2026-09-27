import { describe, it, expect } from "vitest";
import { shouldCoalesce, COALESCE_WINDOW_MS } from "@/server/events/coalesce";

describe("shouldCoalesce pure function", () => {
  const baseTime = "2026-09-28T10:00:00.000Z";

  it("returns true when new event occurredAt is within 30 minutes of existing event", () => {
    // 5 minutes later
    const event5m = { occurredAt: "2026-09-28T10:05:00.000Z" };
    expect(shouldCoalesce({ occurredAt: baseTime }, event5m)).toBe(true);

    // 29 minutes later
    const event29m = { occurredAt: "2026-09-28T10:29:00.000Z" };
    expect(shouldCoalesce({ occurredAt: baseTime }, event29m)).toBe(true);

    // Exactly 30 minutes later (1,800,000 ms)
    const exact30m = new Date(new Date(baseTime).getTime() + COALESCE_WINDOW_MS).toISOString();
    expect(shouldCoalesce({ occurredAt: baseTime }, { occurredAt: exact30m })).toBe(true);
  });

  it("returns false when new event occurredAt is older or newer by more than 30 minutes", () => {
    // 30 minutes + 1 second later
    const event30m1s = new Date(new Date(baseTime).getTime() + COALESCE_WINDOW_MS + 1000).toISOString();
    expect(shouldCoalesce({ occurredAt: baseTime }, { occurredAt: event30m1s })).toBe(false);

    // 2 hours later
    const event2h = { occurredAt: "2026-09-28T12:00:00.000Z" };
    expect(shouldCoalesce({ occurredAt: baseTime }, event2h)).toBe(false);
  });

  it("returns false if any timestamp is invalid", () => {
    expect(shouldCoalesce({ occurredAt: "invalid" }, { occurredAt: baseTime })).toBe(false);
    expect(shouldCoalesce({ occurredAt: baseTime }, { occurredAt: "not-a-date" })).toBe(false);
  });
});
