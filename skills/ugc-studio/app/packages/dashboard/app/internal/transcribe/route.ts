import { handleApi } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const text = await req.text();
  let body: unknown = {};
  if (text) {
    try { body = JSON.parse(text); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  }
  return handleApi("POST", url, body, req.headers);
}
