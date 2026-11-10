import { mediaResponse } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string; kind: string } }): Promise<Response> {
  const out = await mediaResponse(`/media/video/${params.id}/${params.kind}`);
  return out || Response.json({ error: "not found" }, { status: 404 });
}
