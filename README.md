# ChatCMS Adv

One **real-time** inbox for your **WhatsApp** conversations (Meta Cloud API). Read every chat and reply from one screen. New messages, delivery ticks and status changes appear instantly in every open tab, with no refresh and no polling.

Plus **WhatsApp marketing**, in the spirit of tools like AiSensy:
- contacts with opt-in tracking, and saved audience segments
- your own templates, including authentication (OTP); they're reviewed by WhatsApp and visible in WhatsApp Manager
- broadcast campaigns, sent now or scheduled
- API campaigns: auto-replies to incoming messages, or triggered from your systems
- engagement analytics

See [WhatsApp marketing](#whatsapp-marketing).

A second channel for **your own chatbot** is already built in but **turned off for now**. See [Chatbot channel](#chatbot-channel-turned-off-for-now).

**Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL on Neon, Tailwind 4. Real-time uses Server-Sent Events plus Postgres `LISTEN/NOTIFY`, so there's no extra service to sign up for.

## Getting started

```bash
npm install
cp .env.example .env      # paste your Neon connection string into DATABASE_URL
npm run db:migrate        # creates the tables in Neon
npm run dev               # open http://localhost:3000
```

Try it without sending a real WhatsApp message. Make sure `WA_APP_SECRET` is set in `.env` (any value works locally), keep the inbox open, and run:

```bash
npm run test:whatsapp -- "Hi, is this in stock?"
```

The conversation appears immediately. Add a phone number and name to simulate someone else: `npm run test:whatsapp -- "Hello" 919811112222 "Asha"`.

> **Careful with replies to simulated chats.** If `.env` has your real WhatsApp credentials, replying to a simulated conversation sends a real WhatsApp message to that number. Simulate with your own number, or expect the reply to fail.

> **No login.** The dashboard has no authentication yet. Anyone who can open the URL can read chats and send replies. Keep it on your own machine, or put protection in front of it (for example, password protection from your hosting provider) before deploying it publicly.

### Database: one URL

Put the connection string from the Neon console in `DATABASE_URL`. That's the only database setting. Pooled (host contains `-pooler`) or direct both work. Normal queries use the URL as given. Migrations and the real-time `LISTEN` connection can't go through Neon's pooler, so the app connects directly for those by dropping `-pooler` from the host (`src/lib/database-url.ts`).

## How it works

```
Your chatbot ─POST /api/ingest/messages──▶┐   (turned off for now)
             ◀─POST BOT_CALLBACK_URL──────┤
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
| `Message` | One message. `senderType` says who wrote it: `CUSTOMER`, `BOT` (your chatbot), `HUMAN` (you, from the dashboard) or `CAMPAIGN`. |

Marketing adds:

| Table | What it is |
|---|---|
| `Contact` (extra columns) | `waId` (one contact per WhatsApp number), `tags`, `attributes` (custom fields, incl. `school` and `class`), `optInStatus` + source and dates, `blocked` |
| `ConsentEvent` | Every opt-in / opt-out, with its source. Audit trail + growth chart. |
| `Segment` | A saved audience: rules, evaluated when a campaign starts |
| `Campaign` | One template, sent as a `BROADCAST` (audience filters, schedule) or an `API` campaign (auto-reply trigger, Live/Paused). Holds a template snapshot and how placeholders are filled |
| `CampaignRecipient` | One send: status + sent/delivered/read/replied/button/opt-out times (and per-send values for API campaigns) |
| `TemplateDraft` | Templates you're still writing, and a record of what was submitted from here |
| `Setting` | Message rates for cost estimates |

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
    enabled-channels.ts         Which channels are switched on (WhatsApp; chatbot is off)
    database-url.ts             Pooled → direct Neon URL (for LISTEN and migrations)
    marketing/
      templates.ts              Template structure, placeholders, per-recipient send payload (pure, tested)
      segments.ts               Segment rules → database filter (pure, tested)
      campaign-runner.ts        Sends campaigns: claiming, retries, stop rules, crash recovery
      campaigns.ts              Create / list / cancel campaigns, funnel stats
      campaign-status.ts        Delivery ticks → campaign funnel
      inbound.ts                Replies → reply/button attribution, STOP → opt-out
      consent.ts                Opt-in / opt-out + audit trail
      contacts.ts, csv.ts       Contact list, CSV import, opt-in API
      segment-service.ts        Segments with live sizes
      analytics.ts              Engagement queries
      phone.ts, opt-out.ts      Phone normalization, opt-out keywords
      template-builder.ts       Template editor draft ⇄ Meta format + review checks, incl. authentication + TTL (pure, tested)
      template-admin.ts         Create / edit / delete templates in your WhatsApp account, sample uploads
      template-drafts.ts        Drafts, and when templates were submitted from here
      template-starters.ts      The Explore library
      api-campaigns.ts          Auto-replies + API-triggered sends (api-trigger.ts: the matching rules)
      account.ts                Quality rating, messaging tier, remaining quota
    settings.ts                 Settings with defaults (message rates)
  app/(app)/                    Pages: inbox, contacts, segments, templates, campaigns, analytics, settings
  app/api/
    stream                      Live updates (SSE)
    webhooks/whatsapp           Meta webhook (verify + receive)
    ingest/messages             Your bot pushes messages here
    conversations/...           Dashboard API (list, detail, reply, status, read)
    media/[mediaId]             Shows WhatsApp images, audio and video in the browser
    whatsapp/templates          Approved templates for the picker
    contacts/...                Contacts, tags, CSV import, opt-in API
    segments/...                Segments + live preview
    templates/...               Your WhatsApp templates: list, create, edit, delete, sample media
    campaigns/...               Campaigns, templates, audience size, recipients, cancel
    cron/campaigns              Starts due campaigns (called by GitHub Actions)
    v1/campaigns/send           Trigger an API campaign from your systems (API_KEY)
    account/status, settings    Number health; settings
    analytics                   Engagement numbers
  hooks/useInbox.ts             Inbox state + live updates
  hooks/useInboxStream.ts       EventSource connection + status
  components/inbox/             UI: list, thread, composer, contact panel, badges
  components/{contacts,segments,templates,campaigns,settings,analytics,charts}/   Marketing UI
.github/workflows/campaign-scheduler.yml   Every 30 min: start due campaigns
scripts/                        Local simulators for your bot and for Meta
docs/BOT_INTEGRATION.md         Contract for your chatbot team
docs/OPT_IN_API.md              Opt-in API for your website / forms
docs/API.md                     API campaigns: send templates (e.g. OTPs) from your systems
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
   - Subscribe to the **messages** field, and to **user_preferences** (people stopping or resuming your marketing messages inside WhatsApp; Meta is still rolling this field out, so it may not be listed yet).

   For local testing, expose your machine with `ngrok http 3000` and use the ngrok URL.
5. Send a WhatsApp message to your business number. It appears in the inbox instantly.

**24-hour rule:** WhatsApp only allows free-text replies within 24 hours of the customer's last message. After that, the reply box switches to **template mode**, and you can only send templates approved in WhatsApp Manager.

## WhatsApp marketing

### Setup

1. **Database:** run `npm run db:deploy` (adds the marketing tables).
2. **Secrets in Vercel** (Settings → Environment Variables), then redeploy:
   - `CRON_SECRET`: a long random value (`openssl rand -hex 32`), for scheduled campaigns
   - `API_KEY`: another one, for API campaigns and the opt-in API ([docs/API.md](docs/API.md))
3. **GitHub scheduler** (repo → Settings → Secrets and variables → Actions):
   - Secret `CRON_SECRET`: the same value as in Vercel
   - Variable `APP_URL`: e.g. `https://chatcms-one.vercel.app`

   Then push to the default branch and run **Actions → Campaign scheduler → Run workflow** once to check that it works. You should see `OK: {"ok":true}`. The workflow runs every 30 minutes whether or not anything is scheduled (each run just asks the app what's due). If a run fails, its log says what to fix: a missing or mismatched secret, or a wrong `APP_URL`.
4. **WhatsApp:** a valid, permanent `WA_ACCESS_TOKEN` (temporary tokens expire after 24h and every send fails). It needs both `whatsapp_business_messaging` (sending) and `whatsapp_business_management` (templates) permissions.

**Settings** (bottom of the sidebar) shows what's connected and gives you the webhook URL to paste into Meta.

### Using it

1. **Contacts**: **Add contact** one at a time (number, name, email, school, class, other details like a parent's name, tags, and whether they agreed to messages), import a CSV (needs a `phone` column; `name`, `email`, `school`, `class`, `tags`, `opted_in` and any custom columns are picked up), or collect opt-ins from your website through the opt-in API. Customers who message you appear automatically, but not as opted in. Click a contact's name (or **Edit details** in the inbox) to change their details; when someone you added messages you, the chat joins their contact.
2. **Templates**: write your own (see below), start from the **Explore** library, or use ones made in WhatsApp Manager.
3. **Segments**: save audiences such as "tagged vip, messaged us in the last 30 days, +91". A segment's size is live, and it's re-evaluated when a campaign starts.
4. **Campaigns → Launch**:
   - **Broadcast**: one template to the contacts matching your filters, now or scheduled (see below).
   - **API Campaign**: one person at a time, either as an **auto-reply** when customers message you or triggered by your systems ([docs/API.md](docs/API.md)).
5. **Campaign page**: stage tabs (Sent, Delivered, Read, Replied, Button taps, Failed) with each stage's people and a CSV "User Report". Overview shows the duration, estimated **credit usage**, button taps and messages per day.
6. **Analytics**: conversations, campaign engagement, and audience growth.

The Campaigns header shows your number's **quality rating**, **messaging tier** (how many people you can start conversations with per 24h) and the **remaining quota**.

### Templates

**Templates** lists every template in your WhatsApp Business Account, with tabs for Explore, All, Draft, Pending, Approved and Action Required (rejected, paused, disabled). Each row shows its category, status (with WhatsApp's rejection reason in plain words), type, health and when it was created here. Actions: use in a campaign, edit, duplicate, delete. Meta is the source of truth, so templates created here appear in WhatsApp Manager and vice versa.

**New Template Message** follows the familiar layout:

- **Category**: Marketing, Utility or **Authentication**. **Language**.
- **Time-To-Live (TTL)**: how long WhatsApp keeps trying to deliver to someone who's offline. Authentication 30 sec–15 min, utility 30 sec–12 hours, marketing 12 hours–30 days.
- **Name**, then **Type** (text, image, video or document). Text templates can have a header, and media templates need a sample file, uploaded to Meta for you (up to 4 MB, or a public https link for bigger files).
- **Format**: the message, with bold, italic and strikethrough, **built-in variables** (see below), "Add variable" (`{{1}}` or `{{your_name}}`) and a sample value for each variable.
- **Footer**, and **Interactive Actions**: None / Call to Actions / Quick Replies / All. Call-to-actions are a website (optionally personal per customer), a phone number or a copy code; quick replies are reply buttons. The counters show how many of each you can still add. Marketing templates get a one-click "Stop promotions" button, which this app treats as an opt-out.
- **Authentication** templates replace the message part with: code delivery (copy code, one-tap autofill or zero-tap; the last two need your Android package name and signature hash), the security line, the code's expiry (1–90 minutes) and the button text. WhatsApp writes the text itself.

**Built-in variables** fill themselves from each contact, in campaigns, API campaigns and the inbox:

| Variable | Filled with | If missing |
|---|---|---|
| `{{first_name}}` | First word of the contact's name | "there" |
| `{{phone_number}}` | Their WhatsApp number, e.g. +919812345678 | (always known) |
| `{{school}}` | Their school | "your school" |
| `{{class}}` | Their class, e.g. `8` (so write "Class {{class}}") | "your class" |
| `{{email}}` | Their email | you choose |

Click a chip above the message box to insert one; its sample value is filled in for WhatsApp's review. They need `{{name}}`-style variables, so a new template switches to that style. Common spellings work too: `{{name}}`, `{{school_name}}`, `{{grade}}`, `{{standard}}`. You can change any value or fallback when you set up a campaign.

A live preview shows how it will look, and every WhatsApp rule is checked before you can submit. **Save as draft** keeps unfinished templates in the Draft tab. WhatsApp reviews new templates, usually within minutes, at most 24 hours, and the list refreshes itself until it's decided.

- **Edit**: rejected and paused templates any time; approved ones **once a day and 10 times a month** (WhatsApp's rule), after which they go back to review. Name, language, variable style and TTL can't change.
- **Delete** removes that language version. An approved name can't be reused for 30 days, and templates used by a scheduled or sending campaign can't be deleted.

Carousels, flows, catalog and location headers aren't supported in the editor yet; create those in WhatsApp Manager.

### Choosing a broadcast's audience

**Select Audience** works like a list of filters that must all match. A new broadcast starts with **Opted in is Yes** and the fixed **Blocked is No**; **+ Add filter** adds more:

- **Quick filters**: tags (has any / all / none of), created date, last seen (when they last wrote to you), opted in, a saved segment
- **Attributes**: first name, name, mobile number (e.g. starts with 91), email, school, class, whether they've messaged you
- **Custom attributes**: any other detail your contacts have, e.g. parent's name or city

Text filters can be *is*, *is not*, *contains*, *doesn't contain*, *starts with*, *is empty* or *is not empty*, take several values ("School is DPS or KV"), and ignore capital letters. School, class and other details suggest the values your contacts actually have, with counts. Click a filter to change it, or × to remove it.

Below the filters you see the number of contacts and the newest 10 of them. The audience is recounted when the campaign starts, so contacts added or changed in between are included.

Removing **Opted in is Yes** includes people who haven't opted in yet (for example, students who gave their number on an admission form). You'll be asked to confirm you have their permission: WhatsApp requires it, and messaging people who didn't agree can lower your quality rating or get your number restricted.

### API campaigns and auto-replies

An API campaign sends its template to one person at a time:

- **Auto-reply** (no code): when a customer messages you, they get the template, for example a welcome with "Pricing / Book a demo / Support" buttons, so you learn what they need. Choose **any message** (with a cooldown, default 24h per person), **first message from a new contact**, or **keywords** (`price, fees`). Keyword campaigns win over "first message", which wins over "any message"; each message gets at most one auto-reply, and "STOP" never gets one.
- **From your systems**: `POST /api/v1/campaigns/send` with the campaign name, a phone number and per-message values such as an OTP code. See [docs/API.md](docs/API.md). The campaign page shows a ready-to-copy example.

Switch an API campaign on and off with **Pause / Go live**. Every send shows up in its funnel like a broadcast.

### How sending works

- **Broadcasts go to opted-in contacts** unless you remove the "Opted in is Yes" filter and confirm you have their permission. People who opted out are never included. Consent is checked again right before each send, so anyone who opts out (or is blocked) after a campaign is scheduled is skipped.
- **Blocked contacts never get anything:** no broadcasts, API campaigns, auto-replies or replies. Block someone from the Contacts page or the inbox's side panel; their messages still arrive in the inbox.
- **API campaigns** (replies and one-off sends) go to anyone with a WhatsApp number, except that **marketing** templates still skip people who opted out.
- **Opt-outs are automatic.** The contact page shows why someone was opted out:
  - **Replied STOP**: a reply of STOP, STOP ALL, UNSUBSCRIBE, OPT OUT, REMOVE ME or "Stop promotions" (e.g. a quick-reply button).
  - **Stopped marketing in WhatsApp**: they tapped "Stop" on your marketing messages in WhatsApp (the `user_preferences` webhook), or a message failed with error 131050. If they tap "Resume" later, they're opted back in.

  Undeliverable messages (error 131026: they blocked your number, aren't on WhatsApp, or use an outdated app; Meta doesn't say which) are marked failed but don't change anyone's consent.

  A CSV import can't re-subscribe anyone who opted out; only they can, through you, the dashboard or the opt-in API.
- **"Send now"** starts right away. **Scheduled** campaigns start on the next scheduler run after their time. The GitHub workflow runs every 30 minutes, so allow up to about 30–45 minutes.
- **Big campaigns** send about 25 messages per batch, 8 at a time. Each run works for up to 4 minutes, then hands over to a fresh request, so the cron isn't needed to finish.
- **No duplicates:** each recipient is locked while being sent. If it's unclear whether WhatsApp accepted a message (network error, crash), it's marked failed, not retried.
- **Stops early** on errors that would hit everyone: an expired token, a paused or disabled template, a spam limit, or 10 identical failures in a row. Unsent recipients are marked skipped and the campaign shows why.
- **Replies are attributed** exactly when the customer replies to or taps a button on the campaign message, and otherwise to their latest campaign within 3 days.
- **Campaign messages appear in each customer's chat**, but a chat only shows up in the inbox list once the customer replies, so a broadcast doesn't flood the inbox.
- **Credit usage** is an estimate: delivered messages × your message rate per category (Settings → Message rates; defaults are Meta's India list rates).

## Chatbot channel (turned off for now)

Your chatbot can push its conversations into the same inbox, and replies from the dashboard are sent back to it. All of this is built, but it stays off until you have a callback URL for your bot. While it's off, the inbox shows only WhatsApp and `POST /api/ingest/messages` answers `404`.

To turn it on:

1. Set `BOT_INGEST_SECRET` and `BOT_CALLBACK_URL` in `.env` (see `.env.example`).
2. Add `"WEB_BOT"` to `ENABLED_CHANNELS` in `src/lib/enabled-channels.ts`.
3. Restart. The channel filter, the bot statuses ("Bot replying", "Hand back to bot") and `npm run test:bot-message` start working.

No database change is needed. The contract for your bot is in [docs/BOT_INTEGRATION.md](docs/BOT_INTEGRATION.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run db:migrate` | Apply schema changes to the database (creates a migration) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run test:bot-message -- "text" [conversationId] [bot]` | Send a fake chatbot message (only when the chatbot is on) |
| `npm run test:whatsapp -- "text" [phone] [name]` | Send a fake WhatsApp message (signed like Meta) |
| `npm run test:whatsapp -- --status read <wamid>` | Send a fake delivery tick for a message you sent |
| `npm test` | Unit tests |
| `npm run typecheck` / `npm run lint` | Type check / lint |

## Deploying

The app works on any Node host: Vercel, Railway, Render, Fly or a VPS, with one or several instances.

- **Serverless (e.g. Vercel):** platforms cap how long a request can stay open, so `/api/stream` is cut off periodically. The browser reconnects by itself within a few seconds and refetches, so you won't miss anything. You'll just see **Reconnecting…** for a moment.
- **Neon costs:** while at least one inbox tab is open, each server keeps one direct connection to Neon, which keeps the compute awake. It disconnects 30 seconds after the last tab closes, so Neon can scale to zero again.
- **Proxies:** the stream sends a heartbeat every 25 seconds and disables buffering (`X-Accel-Buffering: no`). If you put nginx in front, make sure response buffering is off for `/api/stream`.
- **Deploy in your database's region.** Every query is a round trip to Neon. If the app runs far from the database, as it does on a laptop on another continent, each query costs a few hundred milliseconds and each new connection about 2 seconds, so updates sometimes lag by a second or two. Running the app in the same region as your Neon project (shown in its host name, e.g. `us-east-2`) brings this down to a few milliseconds.
- Run `npm run db:deploy` on deploy to apply migrations.

## Limitations

- **No login.** See the note at the top. With campaigns this matters more: anyone with the URL could message your whole opted-in audience and change settings. (The `/api/v1` and opt-in APIs are protected by `API_KEY`; the dashboard isn't.)
- **Replies can only be text or WhatsApp templates.** Sending media from the dashboard isn't supported yet.
- **The inbox's template picker fills body placeholders only.** Templates with media headers, header variables or button variables can be sent from Campaigns. Location headers, carousels, flows and catalog buttons aren't supported anywhere yet.
- **No link-click tracking.** WhatsApp doesn't report URL button taps; quick-reply button taps are tracked.
- **Credit usage is an estimate** from your configured rates; your Meta invoice is the source of truth.
- **One customer can appear twice.** Someone who chats on both WhatsApp and your website becomes two separate contacts.
- **No typing indicators.** These would need your bot to send typing events.
- **Many tabs over plain HTTP/1.1:** browsers allow about 6 open connections per site, and each inbox tab uses one for the live stream. Over HTTPS (HTTP/2), which most hosts use, this limit doesn't apply.
