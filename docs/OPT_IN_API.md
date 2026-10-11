# Opt-in API

Use this when someone agrees to WhatsApp marketing on your website, checkout or forms ("Send me offers on WhatsApp"). The contact is created or updated and marked **opted in**, so campaigns can reach them.

Call it **from your backend**, never from the browser: the key would be visible to anyone.

## Setup

Set `OPTIN_API_KEY` in the app's environment (Vercel → Settings → Environment Variables) to a long random value, e.g. the output of `openssl rand -hex 32`, then redeploy.

## Request

`POST /api/contacts/opt-in`

```
Authorization: Bearer <OPTIN_API_KEY>
Content-Type: application/json
```

```json
{
  "phone": "+919812345678",
  "name": "Asha Sharma",
  "email": "asha@example.com",
  "tags": ["website", "diwali-2026"],
  "attributes": { "city": "Pune", "plan": "gold" },
  "optedIn": true
}
```

| Field | Required | Notes |
|---|---|---|
| `phone` | yes | Full international number with country code. `+91 98123-45678` and `0091…` work too. |
| `name`, `email` | no | Overwrite what we have. |
| `tags` | no | Added to the contact's existing tags (lowercased). |
| `attributes` | no | Custom fields, merged with existing ones. Usable in campaign messages as "Custom: city", etc. |
| `optedIn` | no | Default `true`. Send `false` to record an opt-out (e.g. they unticked the box in their profile). |

Calling it again for the same number is safe: it updates the same contact.

An explicit opt-in through this API re-subscribes someone who had opted out before. It's a fresh, explicit consent from that person. A CSV import never does this.

## Responses

- `200 {"ok":true,"contactId":"…","created":true}`
- `400` means the payload or phone number is invalid. The response says why.
- `401` means the API key is missing or wrong.

## Example (Node.js)

```js
await fetch("https://chatcms-one.vercel.app/api/contacts/opt-in", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPTIN_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ phone: form.phone, name: form.name, tags: ["website"] }),
});
```

## How else people opt in or out

| Way | Opt in | Opt out |
|---|---|---|
| This API | yes | yes (`optedIn: false`) |
| CSV import | yes (opted_in column, or "everyone agreed") | yes (opted_in = no) |
| Dashboard (Contacts page, inbox side panel) | yes | yes |
| Customer replies STOP / UNSUBSCRIBE / "Stop promotions" | | yes, automatically |
| Customer blocks marketing in WhatsApp (error 131050) | | yes, automatically |

Every change is recorded with its source and time. The Analytics page charts opt-ins and opt-outs per day from this history.
