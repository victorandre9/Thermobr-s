import type { DBOrTx } from "../db";
import { auditoria } from "../db/schema";
import type { Ctx } from "../auth/contexto";

const CAMPOS_PROIBIDOS = /senha|token|hash|secret/i;

function limpar(v: unknown): unknown {
  if (v === null || v === undefined || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(limpar);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !CAMPOS_PROIBIDOS.test(k)).map(([k, x]) => [k, limpar(x)]));
}

export async function auditar(
  tx: DBOrTx,
  ctx: Pick<Ctx, "usuarioId" | "empresaId"> | { usuarioId: string | null; empresaId: string },
  a: { acao: string; entidadeTipo: string; entidadeId?: string | null; motivo?: string | null; antes?: unknown; depois?: unknown; sensivel?: boolean },
) {
  await tx.insert(auditoria).values({
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    acao: a.acao,
    entidadeTipo: a.entidadeTipo,
    entidadeId: a.entidadeId ?? null,
    motivo: a.motivo ?? null,
    antes: limpar(a.antes) ?? null,
    depois: limpar(a.depois) ?? null,
    sensivel: a.sensivel ?? false,
  });
}
