import { db } from "../db";
import { toMessageDTO, toSummaryDTO } from "../dto";
import type { InboxEvent } from "../types";
import type { ChangeNotice } from "./publish";

// Real-time, step 2 of 3: turn a { kind, id } notice into the full event the UI needs.
// Reads the CURRENT row, so a late notice still yields the latest state.

export async function hydrate(notice: ChangeNotice): Promise<InboxEvent | null> {
  if (notice.kind === "message") {
    const message = await db.message.findUnique({
      where: { id: notice.id },
      include: { conversation: { include: { contact: true } } },
    });
    if (!message) return null;
    return { type: "message", message: toMessageDTO(message), conversation: toSummaryDTO(message.conversation) };
  }

  const conversation = await db.conversation.findUnique({ where: { id: notice.id }, include: { contact: true } });
  if (!conversation) return null;
  return { type: "conversation", conversation: toSummaryDTO(conversation) };
}

export function parseNotice(payload: string | undefined): ChangeNotice | null {
  try {
    const value = JSON.parse(payload ?? "");
    if ((value?.kind === "message" || value?.kind === "conversation") && typeof value.id === "string") {
      return { kind: value.kind, id: value.id };
    }
  } catch {
    // fall through
  }
  return null;
}
