import type { NormalizedEvent } from "./types";
import type { RawEventRow } from "./normalize";

export const COALESCE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes (1,800,000 ms)

/**
 * Pure function determining whether a new doc event should coalesce into an existing doc event.
 * Returns true if newRawEvent.occurredAt is within 30 minutes (1,800,000 ms) of existingEvent.occurredAt.
 */
export function shouldCoalesce(
  existingEvent: Pick<NormalizedEvent, "occurredAt">,
  newRawEvent: Pick<RawEventRow, "occurredAt">
): boolean {
  const existingTime = new Date(existingEvent.occurredAt).getTime();
  const newTime = new Date(newRawEvent.occurredAt).getTime();

  if (Number.isNaN(existingTime) || Number.isNaN(newTime)) {
    return false;
  }

  const diff = Math.abs(newTime - existingTime);
  return diff <= COALESCE_WINDOW_MS;
}

/**
 * Returns the later of the existing and new occurredAt timestamps, never earlier.
 */
export function pickLaterOccurredAt(
  existingOccurredAt: string,
  newOccurredAt: string
): string {
  const existingTime = new Date(existingOccurredAt).getTime();
  const newTime = new Date(newOccurredAt).getTime();

  if (Number.isNaN(existingTime)) return newOccurredAt;
  if (Number.isNaN(newTime)) return existingOccurredAt;

  return newTime > existingTime ? newOccurredAt : existingOccurredAt;
}

