// Pretend to be your chatbot: sends a signed message to the ingest API.
//
//   npm run test:bot-message -- "Hello, I need help"            customer message in demo-session-1
//   npm run test:bot-message -- "Hi!" my-session                 customer message in another session
//   npm run test:bot-message -- "How can I help?" my-session bot a reply from your bot
//
// Needs `npm run dev` running and BOT_INGEST_SECRET in .env.
import crypto from "node:crypto";

const [text = "Hi! I have a question about my order.", conversationId = "demo-session-1", sender = "customer"] =
  process.argv.slice(2);
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.BOT_INGEST_SECRET ?? "";

const body = JSON.stringify({
  conversationId,
  contact: { name: "Demo Visitor", email: "visitor@example.com" },
  message: {
    id: crypto.randomUUID(),
    senderType: sender === "bot" ? "BOT" : "CUSTOMER",
    type: "text",
    text,
    timestamp: new Date().toISOString(),
  },
});

const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

async function main() {
  const res = await fetch(`${baseUrl}/api/ingest/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body,
  });
  console.log(res.status, await res.text());
}

main();
