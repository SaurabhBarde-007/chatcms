import { NextResponse } from "next/server";
import { listAttributeKeys, listTags } from "@/lib/marketing/contacts";

// GET /api/contacts/tags → { tags: [{ tag, count }], fields: ["city", …] }
export async function GET() {
  const [tags, fields] = await Promise.all([listTags(), listAttributeKeys()]);
  return NextResponse.json({ tags, fields });
}
