import { db } from "../db";

// Real-time, step 1 of 3: announce that something changed.
//
// We only send ids through Postgres (NOTIFY payloads are capped at 8000 bytes and a long
// message could exceed that). Each server's listener loads the full data before pushing
// it to browsers — see ./listener.ts.

export const NOTIFY_CHANNEL = "inbox_events";

export type ChangeNotice = { kind: "message" | "conversation"; id: string };

/**
 * Tell every open dashboard (on every server instance) that a message or conversation changed.
 * Never throws: the change is already saved, and dashboards resync when they reconnect.
 */
export async function publish(notice: ChangeNotice): Promise<void> {
  try {
    await db.$executeRaw`SELECT pg_notify(${NOTIFY_CHANNEL}, ${JSON.stringify(notice)})`;
  } catch (err) {
    console.error("[realtime] publish failed:", err);
  }
}
