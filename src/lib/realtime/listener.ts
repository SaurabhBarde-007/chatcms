import { EventEmitter } from "node:events";
import { Client } from "pg";
import { env } from "../env";
import type { InboxEvent } from "../types";
import { hydrate, parseNotice } from "./hydrate";
import { NOTIFY_CHANNEL } from "./publish";

// Real-time, step 3 of 3: ONE Postgres LISTEN connection per server process,
// fanned out to every open dashboard tab (each tab is one /api/stream request).
//
//   publish() ── NOTIFY ──▶ Postgres ──▶ this listener ──▶ hydrate ──▶ every subscribed tab
//
// - Connects directly, not through Neon's pooler: LISTEN doesn't work through the pooler.
// - Connects when the first tab subscribes; disconnects 30s after the last one leaves,
//   so Neon can scale to zero when nobody has the inbox open.
// - Reconnects with backoff if the connection drops, then tells every tab "ready" so it
//   refetches whatever it might have missed.

export type StreamEvent = { event: "ready" } | { event: "inbox"; data: InboxEvent };
type Subscriber = (event: StreamEvent) => void;

const IDLE_DISCONNECT_MS = 30_000;
const HEALTH_CHECK_MS = 60_000;
const MAX_RETRY_MS = 30_000;

class InboxListener {
  private emitter = new EventEmitter();
  private client: Client | null = null;
  private connecting = false;
  private retryMs = 1000;
  private retryTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  // Notices are hydrated one at a time, so tabs receive updates in the order they happened
  // (e.g. a reply's SENT can never overtake its PENDING).
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Receive inbox events. "ready" is sent once we're listening — refetch state then. */
  subscribe(fn: Subscriber): () => void {
    this.emitter.on("event", fn);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;

    if (this.client) queueMicrotask(() => fn({ event: "ready" }));
    else this.connect();

    return () => {
      this.emitter.off("event", fn);
      if (this.emitter.listenerCount("event") === 0 && !this.idleTimer) {
        this.idleTimer = setTimeout(() => this.disconnect(), IDLE_DISCONNECT_MS);
      }
    };
  }

  private get hasSubscribers() {
    return this.emitter.listenerCount("event") > 0;
  }

  private emit(event: StreamEvent) {
    this.emitter.emit("event", event);
  }

  private async connect() {
    if (this.client || this.connecting || this.retryTimer) return;
    this.connecting = true;

    const client = new Client({ connectionString: env.directDatabaseUrl, keepAlive: true, connectionTimeoutMillis: 10_000 });
    client.on("notification", (msg) => {
      const notice = parseNotice(msg.payload);
      if (!notice) return;
      this.queue = this.queue
        .then(() => hydrate(notice))
        .then((data) => {
          if (data) this.emit({ event: "inbox", data });
        })
        .catch((err) => console.error("[realtime] hydrate failed:", err));
    });
    client.on("error", (err) => this.handleDrop(client, err));
    client.on("end", () => this.handleDrop(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      this.client = client;
      this.retryMs = 1000;
      this.healthTimer = setInterval(() => {
        client.query("SELECT 1").catch((err) => this.handleDrop(client, err));
      }, HEALTH_CHECK_MS);
      this.emit({ event: "ready" });
      // Every tab may have left while we were connecting.
      if (!this.hasSubscribers && !this.idleTimer) {
        this.idleTimer = setTimeout(() => this.disconnect(), IDLE_DISCONNECT_MS);
      }
    } catch (err) {
      console.error("[realtime] listener connect failed:", err);
      client.end().catch(() => {});
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private handleDrop(client: Client, err?: unknown) {
    if (client !== this.client) return; // already handled, or an old connection
    if (err) console.error("[realtime] listener connection lost:", err);
    this.clearConnection();
    client.end().catch(() => {});
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (!this.hasSubscribers || this.retryTimer) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.hasSubscribers) this.connect();
    }, delay);
  }

  private disconnect() {
    this.idleTimer = null;
    if (this.hasSubscribers) return;
    const client = this.client;
    this.clearConnection();
    client?.end().catch(() => {});
  }

  private clearConnection() {
    this.client = null;
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }
}

// One listener per process. Kept on globalThis so dev hot reload doesn't open a second one.
const globalForListener = globalThis as unknown as { inboxListener?: InboxListener };

export function inboxListener(): InboxListener {
  return (globalForListener.inboxListener ??= new InboxListener());
}
