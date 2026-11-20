import { mediaResponse } from "@app/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const out = await mediaResponse(`/media/avatar/${id}`);
  return out || Response.json({ error: "not found" }, { status: 404 });
}
