import { loadConfig } from "@/server/config";
import { getWriterDb } from "@/server/db/client";
import { syncState } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { syncNotion } from "@/server/integrations/notion/collector";
import { normalizePending } from "@/server/events/process";

async function main() {
  console.log(
    JSON.stringify({
      event: "worker_starting",
      timestamp: new Date().toISOString(),
    }),
  );

  loadConfig();
  const db = getWriterDb();

  // Seed sync_state rows if they don't exist
  db.insert(syncState)
    .values([
      { source: "notion" },
      { source: "drive" },
      { source: "worker" },
    ])
    .onConflictDoNothing()
    .run();

  const intervalSeconds =
    parseInt(process.env.SYNC_INTERVAL_SECONDS || "300", 10) || 300;

  let running = true;
  const shutdown = (signal: string) => {
    console.log(
      JSON.stringify({
        event: "worker_stopped",
        signal,
        timestamp: new Date().toISOString(),
      }),
    );
    running = false;
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    try {
      const now = new Date().toISOString();
      const config = loadConfig();

      // Notion sync
      const notionStart = Date.now();
      await syncNotion(db, config);
      console.log(
        JSON.stringify({
          event: "sync_notion_complete",
          durationMs: Date.now() - notionStart,
          timestamp: new Date().toISOString(),
        }),
      );

      // Normalize pending raw events
      const normalizeStart = Date.now();
      normalizePending(db);
      console.log(
        JSON.stringify({
          event: "normalize_complete",
          durationMs: Date.now() - normalizeStart,
          timestamp: new Date().toISOString(),
        }),
      );

      // Heartbeat
      db.update(syncState)
        .set({ lastSuccessAt: now })
        .where(eq(syncState.source, "worker"))
        .run();
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "sync_loop_error",
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      event: "worker_fatal",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});
