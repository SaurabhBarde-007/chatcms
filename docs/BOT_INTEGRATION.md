# Connecting your chatbot

Your chatbot and the inbox talk over two HTTP calls. Both are signed with the shared secret `BOT_INGEST_SECRET`:

| Direction | Who calls | Purpose |
|---|---|---|
| Bot → inbox | `POST {INBOX_URL}/api/ingest/messages` | Log every message (the customer's and the bot's) |
| Inbox → bot | `POST {BOT_CALLBACK_URL}` | Deliver a reply sent from the dashboard, and tell the bot to pause or resume |

> This is the same contract as the original ChatCMS, so a bot built for that works unchanged.

## Signing requests

Both directions use the same header:

```
X-Signature: sha256=<hex HMAC-SHA256 of the raw JSON body, key = BOT_INGEST_SECRET>
```

Node.js example:

```js
const body = JSON.stringify(payload);
const signature = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
```

Sign the exact bytes you send. If the body is re-serialized after signing, the signature won't match.

---

## 1. Bot → inbox: send each message

Call this for **every** message in a conversation: what the customer typed and what the bot answered. It shows up in every open dashboard instantly.

`POST /api/ingest/messages`

```json
{
  "conversationId": "sess_8f2a",
  "contact": { "name": "Priya", "email": "priya@example.com", "phone": "+919812345678" },
  "message": {
    "id": "msg_001",
    "senderType": "CUSTOMER",
    "type": "text",
    "text": "Where is my order?",
    "mediaUrl": null,
    "timestamp": "2026-10-05T10:15:00Z"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `conversationId` | yes | Your session or conversation id. All messages with the same id form one thread. |
| `contact.*` | no | Send whatever you know. Missing details are filled in if you send them later. |
| `message.id` | yes | Unique per message. Resending the same id is ignored, so retries are safe. |
| `message.senderType` | yes | `CUSTOMER` or `BOT` |
| `message.type` | no | Default `text`. Use `image`, `video`, `audio` or `document` together with `mediaUrl`. |
| `message.text` | no | Message text or caption |
| `message.mediaUrl` | no | Public URL of an attachment |
| `message.timestamp` | no | ISO 8601. Defaults to the time the message is received. |

Responses:
- `200 {"ok":true,"duplicate":false}` means the message was stored.
- `401` means the signature is bad.
- `400` means the payload is invalid. The response lists `issues`.

---

## 2. Inbox → bot: events you must handle

The inbox POSTs JSON to `BOT_CALLBACK_URL`. Verify `X-Signature`, then respond with a `2xx` within 10 seconds.

### `reply`: someone replied from the dashboard

```json
{
  "type": "reply",
  "conversationId": "sess_8f2a",
  "message": { "text": "Hi Priya, I'm checking that for you." }
}
```

Show this text in the user's chat widget. You may return `{"id": "<your message id>"}`.

- **Do not** send this message back to `/api/ingest/messages`. The inbox has already stored it.
- A non-2xx response (or a timeout) marks the message as **failed** in the dashboard.

### `handoff`: someone took over, or handed back to the bot

```json
{ "type": "handoff", "conversationId": "sess_8f2a", "mode": "HUMAN" }
```

- `mode: "HUMAN"`: the conversation is being handled from the dashboard. **Stop auto-replying**, but keep sending the customer's messages to the inbox.
- `mode: "BOT"`: the conversation was handed back. Resume normal bot replies.

A handoff also happens automatically when someone replies to a conversation the bot was handling.

---

## Quick test without the bot

```bash
npm run dev
npm run test:bot-message -- "Hello from the widget" demo-session-1
npm run test:bot-message -- "Hi! How can I help?" demo-session-1 bot
```

The conversation appears in the inbox immediately, with no refresh.
