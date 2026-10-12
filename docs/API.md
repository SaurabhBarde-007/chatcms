# API

Two endpoints let your own systems (website, app backend, CRM) work with the inbox. Both authenticate with:

```
Authorization: Bearer <API_KEY>
```

Set `API_KEY` in the app's environment (Vercel → Settings → Environment Variables) to a long random value, e.g. `openssl rand -hex 32`, then redeploy. Call these from your **backend only**: in a browser, the key would be visible to anyone.

| Endpoint | What it does |
|---|---|
| `POST /api/v1/campaigns/send` | Send an **API campaign's** template to one person: OTPs, order updates, follow-ups… |
| `POST /api/contacts/opt-in` | Record that someone opted in (or out) of WhatsApp marketing. See [OPT_IN_API.md](OPT_IN_API.md). |

---

## Send an API campaign

Create the campaign first: **Campaigns → Launch → API Campaign**. Pick an approved template and decide where each placeholder's value comes from. Choose **"From each API call"** for values you'll send per request, like a one-time code or an order number.

`POST /api/v1/campaigns/send`

```json
{
  "campaign": "login_otp",
  "phone": "+919812345678",
  "name": "Asha",
  "params": { "code": "482913" }
}
```

| Field | Required | Notes |
|---|---|---|
| `campaign` | yes | The campaign's name (or id). It must be an API campaign that's **Live**. |
| `phone` | yes | Full international number. The contact is created if new. |
| `name`, `email` | no | Saved on the contact if we didn't have them. |
| `params` | no | Placeholder values for this message (see below). They override the campaign's own values. |
| `tags`, `attributes` | no | Added to the contact (tags) and merged into its custom fields (attributes). |

### `params`

| Key | Fills |
|---|---|
| `"1"`, `"2"`, … or `"first_name"`, … | That body placeholder (`{{1}}`, `{{first_name}}`) |
| `"code"` | The one-time code of an **authentication** template (max 15 characters) |
| `"header"` | The header's text placeholder |
| `"url"` | The dynamic part of the first URL button (`https://shop.com/{{1}}`) |
| `"mediaUrl"` | The image/video/document for a media header (public https link) |

### Responses

- `200 {"ok":true,"id":"…","status":"sent"}`: WhatsApp accepted the message. Delivery and read show up on the campaign page.
- `422 {"ok":false,"status":"failed","error":"…"}`: not sent, e.g. a missing placeholder value or WhatsApp rejected it.
- `422 {"ok":false,"status":"skipped","error":"Opted out of marketing messages"}`: marketing templates aren't sent to people who opted out.
- `202 {"ok":false,"status":"retry"}`: WhatsApp's rate limit. It's queued and sent within a minute.
- `400`: unknown or paused campaign, or an invalid phone. `401`: bad API key.

### Example (Node.js)

```js
await fetch("https://chatcms-one.vercel.app/api/v1/campaigns/send", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ campaign: "login_otp", phone: user.phone, params: { code } }),
});
```

---

## Auto-replies (no code needed)

An API campaign can also **send itself when a customer messages you**. Open the campaign and use "Auto-reply to incoming messages":

- **Any message**: each customer gets it at most once per cooldown (default 24 hours).
- **First message from a new contact**: only someone's very first message.
- **Message contains keywords**: e.g. `price, fees, demo`. Whole words, and case doesn't matter.

If several match, keyword campaigns win over "first message", which wins over "any message". Each incoming message gets at most one auto-reply, and "STOP" never gets one. Auto-replies can't use "From each API call" values, since nothing provides them.
