import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { executarParaTodas, ROTINAS, type NomeRotina } from "@/server/services/rotinas";

/** Chamado pelo Vercel Cron (Authorization: Bearer CRON_SECRET). Idempotente por período. */
export async function GET(req: Request, { params }: { params: Promise<{ rotina: string }> }) {
  const segredo = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  if (!segredo || auth.length !== esperado.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(esperado))) return new Response("Não autorizado", { status: 401 });
  const { rotina } = await params;
  if (!(rotina in ROTINAS)) return new Response("Rotina desconhecida", { status: 404 });
  const r = await executarParaTodas(db, rotina as NomeRotina, "agendador");
  return Response.json({ rotina, resultado: r });
}
