import { getPool } from "@/server/db";
export async function GET() {
  try { await getPool().query("select 1"); return Response.json({ ok: true }); }
  catch { return Response.json({ ok: false }, { status: 503 }); }
}
