// Pretend to be Meta: sends a signed WhatsApp webhook to the local app, so you can test
// the inbox without a real WhatsApp number.
//
//   npm run test:whatsapp -- "Hi, is this in stock?"               message from +919800000001
//   npm run test:whatsapp -- "Hello" 919811112222 "Asha"            message from another number/name
//   npm run test:whatsapp -- --status read <wamid>                  delivery tick for a message you sent
//                                                                    (sent | delivered | read | failed)
//   npm run test:whatsapp -- --status failed <wamid> 131050         failed with a specific error code
//                                                                    (default 131026 "message undeliverable")
//   npm run test:whatsapp -- --preference stop 919811112222         they stopped (or resumed) your
//                                                                    marketing messages in WhatsApp
//
// Needs `npm run dev` running and WA_APP_SECRET in .env (any value works locally).
import crypto from "node:crypto";

const args = process.argv.slice(2);
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.WA_APP_SECRET ?? "";
const now = Math.floor(Date.now() / 1000).toString();

function webhook(value: object) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "TEST_WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }],
  };
}

function buildPayload() {
  if (args[0] === "--preference") {
    const [, value = "stop", waId = "919800000001"] = args;
    if (value !== "stop" && value !== "resume") throw new Error("Usage: npm run test:whatsapp -- --preference <stop|resume> <phone>");
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "TEST_WABA",
          changes: [
            {
              field: "user_preferences",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ wa_id: waId }],
                user_preferences: [
                  { wa_id: waId, detail: `User requested to ${value} marketing messages`, category: "marketing_messages", value, timestamp: Number(now) },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  if (args[0] === "--status") {
    const [, status = "read", wamid, code = "131026"] = args;
    if (!wamid) throw new Error("Usage: npm run test:whatsapp -- --status <sent|delivered|read|failed> <wamid> [error code]");
    return webhook({
      statuses: [
        {
          id: wamid,
          status,
          timestamp: now,
          recipient_id: "919800000001",
          ...(status === "failed" && { errors: [{ code: Number(code), title: code === "131050" ? "User stopped marketing messages" : "Message undeliverable" }] }),
        },
      ],
    });
  }

  const [text = "Hi! Is this available?", from = "919800000001", name = "Test Customer"] = args;
  return webhook({
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id: `wamid.TEST_${crypto.randomUUID()}`, timestamp: now, type: "text", text: { body: text } }],
  });
}

async function main() {
  const body = JSON.stringify(buildPayload());
  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
    body,
  });
  console.log(res.status, await res.text());
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
