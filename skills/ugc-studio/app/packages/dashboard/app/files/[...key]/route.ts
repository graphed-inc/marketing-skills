import { fileResponse } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { key: string[] } }): Promise<Response> {
  const key = (params.key || []).map(decodeURIComponent).join("/");
  const dl = new URL(req.url).searchParams.get("dl");
  return fileResponse(key, dl);
}
