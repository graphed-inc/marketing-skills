import { mediaResponse } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const out = await mediaResponse(`/media/avatar/${params.id}`);
  return out || Response.json({ error: "not found" }, { status: 404 });
}
