import { handleApi } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let body: unknown = {};
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const text = await req.text();
    if (text.length > 60 * 1024 * 1024) return Response.json({ error: "body too large" }, { status: 413 });
    if (text) {
      try { body = JSON.parse(text); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
    }
  }
  return handleApi(req.method, url, body);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
