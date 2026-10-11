import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { uploadSample, uploadSampleFromUrl } from "@/lib/marketing/template-admin";

export const maxDuration = 60;

// POST /api/templates/media → { handle } for a header sample.
//   multipart/form-data with `file` (max ~4 MB through Vercel), or JSON { url } for bigger files.
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
      return NextResponse.json(await uploadSample(await file.arrayBuffer(), file.type, file.name || "sample"));
    }
    const body = await req.json().catch(() => null);
    if (typeof body?.url !== "string") return NextResponse.json({ error: "Send a file or a url" }, { status: 400 });
    return NextResponse.json(await uploadSampleFromUrl(body.url));
  } catch (err) {
    return errorResponse(err);
  }
}
