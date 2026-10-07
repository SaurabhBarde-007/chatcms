import { NextResponse, type NextRequest } from "next/server";
import { downloadMedia } from "@/lib/channels/whatsapp";

// GET /api/media/:mediaId → streams a WhatsApp image/audio/video/document.
// WhatsApp media URLs need our access token, so the browser can't load them directly.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[mediaId]">) {
  const { mediaId } = await ctx.params;
  try {
    const media = await downloadMedia(mediaId);
    return new NextResponse(media.body, {
      headers: {
        "Content-Type": media.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[media] download failed:", err);
    return NextResponse.json({ error: "Media not available" }, { status: 404 });
  }
}
