import { fileResponse } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const { key: segments } = await params;
  const key = (segments || []).map(decodeURIComponent).join("/");
  const dl = new URL(req.url).searchParams.get("dl");
  return fileResponse(key, dl);
}
