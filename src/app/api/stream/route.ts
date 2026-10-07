import { inboxListener } from "@/lib/realtime/listener";
import { formatRetry, formatSSE, SSE_PING } from "@/lib/realtime/sse";

// GET /api/stream — live inbox updates as Server-Sent Events (one connection per open tab).
//
// Events:
//   ready  — we're listening; (re)fetch the list + open thread now. Also sent after a reconnect.
//   inbox  — an InboxEvent (see src/lib/types.ts)
//
// If the platform cuts the request (serverless time limits, deploys), the browser's
// EventSource reconnects by itself and gets a fresh "ready".

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // the browser went away
        }
      };

      const unsubscribe = inboxListener().subscribe((e) =>
        send(e.event === "inbox" ? formatSSE("inbox", e.data) : formatSSE(e.event)),
      );
      const heartbeat = setInterval(() => send(SSE_PING), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
      send(formatRetry(3000));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // stop nginx-style proxies from buffering the stream
    },
  });
}
