import { NextResponse } from "next/server";
import { WhatsAppApiError } from "./channels/whatsapp";

/** An error caused by bad input or a disallowed action — shown to the user as-is (HTTP 400). */
export class UserError extends Error {}

/** Turn a known error into a JSON response; rethrow anything unexpected (→ 500, logged). */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof WhatsAppApiError) {
    return NextResponse.json({ error: `WhatsApp: ${err.message}` }, { status: 502 });
  }
  throw err;
}
