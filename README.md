# ChatCMS Adv

One **real-time** inbox for all customer conversations: **your chatbot** and **WhatsApp** (Meta Cloud API). Read every chat, take over from the bot, and reply on either channel from one screen. New messages, delivery ticks and status changes appear instantly in every open tab, with no refresh and no polling.

**Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL on Neon, Tailwind 4. Real-time uses Server-Sent Events plus Postgres `LISTEN/NOTIFY`, so there's no extra service to sign up for.

## Getting started

```bash
npm install
cp .env.example .env      # paste your Neon connection string into DATABASE_URL
npm run db:migrate        # creates the tables in Neon
npm run dev               # open http://localhost:3000
```

Try it without WhatsApp or your bot. Set `BOT_INGEST_SECRET` and `WA_APP_SECRET` in `.env` (any values work locally), keep the inbox open, and run:

```bash
npm run test:bot-message -- "Hello from the website"
npm run test:whatsapp -- "Hi, is this in stock?"
```

Both conversations appear immediately.

> **No login.** The dashboard has no authentication yet. Anyone who can open the URL can read chats and send replies. Keep it on your own machine, or put protection in front of it (for example, password protection from your hosting provider) before deploying it publicly.

### Database: one URL

Put the connection string from the Neon console in `DATABASE_URL`. That's the only database setting. Pooled (host contains `-pooler`) or direct both work. Normal queries use the URL as given. Migrations and the real-time `LISTEN` connection can't go through Neon's pooler, so the app connects directly for those by dropping `-pooler` from the host (`src/lib/database-url.ts`).

## How it works

```
Your chatbot ─POST /api/ingest/messages──▶┐
             ◀─POST BOT_CALLBACK_URL──────┤   (your replies, handoff)
                                          ▼
Meta WhatsApp ─POST /api/webhooks/whatsapp▶ service layer ──▶ Neon Postgres
              ◀─Graph API /messages───────┘   (ingest.ts,          │
                                               conversations.ts)   │ NOTIFY inbox_events {kind,id}
                                                                   ▼
                                    listener (one per server, direct LISTEN connection)
                                          loads the full message/conversation once
                                                                   │
                                    GET /api/stream (SSE) ─────────┴──▶ every open dashboard tab
```

1. Every change (new message, reply, delivery tick, take over/close, mark read) is saved, then announced with `NOTIFY`. The notice carries only `{kind, id}`, because Postgres limits payloads to 8 KB.
2. Each server process keeps **one** `LISTEN` connection. It loads the changed row once and pushes it to all of that server's open tabs. This works with any number of server instances.
3. The browser applies each event to what's on screen (`src/lib/inbox-state.ts`). Updates are keyed by id, so duplicates are harmless.
4. **Nothing is lost while offline.** Whenever the stream (re)connects, the server sends `ready` and the browser refetches the list and the open chat. The header badge shows **Live**, **Connecting…** or **Reconnecting…**.

All channels share the same three tables, so the dashboard doesn't care where a chat came from:

| Table | What it is |
|---|---|
| `Contact` | The customer: name, phone, email. Created automatically on their first message. |
| `Conversation` | One chat thread with a contact on one channel. Status is `BOT` (bot answering), `HUMAN` (you took over) or `CLOSED`. |
| `Message` | One message. `senderType` says who wrote it: `CUSTOMER`, `BOT` (your chatbot) or `HUMAN` (you, from the dashboard). |

## Project structure

```
prisma/schema.prisma            Database tables
prisma7.config.ts               Prisma CLI config (migrations connect directly, without the pooler)
src/
  lib/
    ingest.ts                   Saves any incoming message (shared by all channels)
    conversations.ts            Dashboard actions: list, open, reply (sendReply), status, mark read
    channels/
      types.ts                  ChannelAdapter interface + normalized InboundMessage
      whatsapp.ts               WhatsApp: send, templates, media, webhook parsing
      webbot.ts                 Your chatbot: incoming payload format, signed callbacks
      index.ts                  Channel → adapter registry
    realtime/
      publish.ts                publish(): NOTIFY after every change
      listener.ts               One LISTEN connection per server, fan-out to tabs, auto-reconnect
      hydrate.ts                {kind, id} → full event with message + conversation
      sse.ts                    Server-Sent Events formatting
    inbox-state.ts              How live events update the screen (pure, unit tested)
    dto.ts / types.ts           JSON shapes shared by API, stream and UI
    whatsapp-window.ts          24-hour reply window rule
    message-status.ts           Delivery status order (never goes backwards)
    signatures.ts               HMAC signing and verification
    env.ts                      All env vars in one place
    database-url.ts             Pooled → direct Neon URL (for LISTEN and migrations)
  app/api/
    stream                      Live updates (SSE)
    webhooks/whatsapp           Meta webhook (verify + receive)
    ingest/messages             Your bot pushes messages here
    conversations/...           Dashboard API (list, detail, reply, status, read)
    media/[mediaId]             Shows WhatsApp images, audio and video in the browser
    whatsapp/templates          Approved templates for the picker
  hooks/useInbox.ts             Inbox state + live updates
  hooks/useInboxStream.ts       EventSource connection + status
  components/inbox/             UI: list, thread, composer, contact panel, badges
scripts/                        Local simulators for your bot and for Meta
docs/BOT_INTEGRATION.md         Contract for your chatbot team
```

**Common changes:**
- **Add an AI agent later:** have it call `sendReply(conversationId, { kind: "text", text })` from `src/lib/conversations.ts`. That's the same function the dashboard uses, so channel sending, the WhatsApp 24h rule, delivery status and live updates all work automatically. You'll probably also want an `AI` value in `SenderType`.
- **Add a channel** (e.g. Instagram):
  1. Add a value to `Channel` in the schema and run `npm run db:migrate`.
  2. Create `src/lib/channels/instagram.ts` implementing `ChannelAdapter`, and register it in `channels/index.ts`.
  3. Add a webhook route that calls `saveInboundMessage()`. Live updates come for free.
- **Add a new kind of change to stream:** save it, then call `publish({ kind, id })`. Teach `realtime/hydrate.ts` and `lib/inbox-state.ts` about it if it's a new kind.
- **Restyle buttons and inputs:** the `.btn`, `.input` and `.chip` classes in `src/app/globals.css`.

## Setting up WhatsApp (Meta Cloud API)

1. In the [Meta App Dashboard](https://developers.facebook.com/apps), open your app, go to **WhatsApp > API Setup**, and copy the **Phone number ID** and **WhatsApp Business Account ID** into `.env`.
2. Create a **System User** in Business Settings with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions. Generate a permanent token and put it in `WA_ACCESS_TOKEN`.
3. Copy **App Settings > Basic > App Secret** into `WA_APP_SECRET`. It's used to verify that webhooks really come from Meta.
4. Under **WhatsApp > Configuration > Webhook**:
   - Callback URL: `https://<your-domain>/api/webhooks/whatsapp`
   - Verify token: the same value as `WA_VERIFY_TOKEN`
   - Subscribe to the **messages** field.

   For local testing, expose your machine with `ngrok http 3000` and use the ngrok URL.
5. Send a WhatsApp message to your business number. It appears in the inbox instantly.

**24-hour rule:** WhatsApp only allows free-text replies within 24 hours of the customer's last message. After that, the reply box switches to **template mode**, and you can only send templates approved in WhatsApp Manager.

## Connecting your chatbot

See [docs/BOT_INTEGRATION.md](docs/BOT_INTEGRATION.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run db:migrate` | Apply schema changes to the database (creates a migration) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run test:bot-message -- "text" [conversationId] [bot]` | Send a fake chatbot message |
| `npm run test:whatsapp -- "text" [phone] [name]` | Send a fake WhatsApp message (signed like Meta) |
| `npm run test:whatsapp -- --status read <wamid>` | Send a fake delivery tick for a message you sent |
| `npm test` | Unit tests |
| `npm run typecheck` / `npm run lint` | Type check / lint |

## Deploying

The app works on any Node host: Vercel, Railway, Render, Fly or a VPS, with one or several instances.

- **Serverless (e.g. Vercel):** platforms cap how long a request can stay open, so `/api/stream` is cut off periodically. The browser reconnects by itself within a few seconds and refetches, so you won't miss anything. You'll just see **Reconnecting…** for a moment.
- **Neon costs:** while at least one inbox tab is open, each server keeps one direct connection to Neon, which keeps the compute awake. It disconnects 30 seconds after the last tab closes, so Neon can scale to zero again.
- **Proxies:** the stream sends a heartbeat every 25 seconds and disables buffering (`X-Accel-Buffering: no`). If you put nginx in front, make sure response buffering is off for `/api/stream`.
- Run `npm run db:deploy` on deploy to apply migrations.

## Limitations

- **No login.** See the note at the top.
- **Replies can only be text or WhatsApp templates.** Sending media from the dashboard isn't supported yet.
- **One customer can appear twice.** Someone who chats on both WhatsApp and your website becomes two separate contacts.
- **No typing indicators.** These would need your bot to send typing events.
- **Many tabs over plain HTTP/1.1:** browsers allow about 6 open connections per site, and each inbox tab uses one for the live stream. Over HTTPS (HTTP/2), which most hosts use, this limit doesn't apply.
