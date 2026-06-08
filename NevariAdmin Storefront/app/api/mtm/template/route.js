import { loadMtmTemplateBytes } from "../../../lib/mtmPdf.js";

export async function GET() {
  try {
    const bytes = await loadMtmTemplateBytes();
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "MTM PDF template could not be loaded." } }, { status: 500 });
  }
}
