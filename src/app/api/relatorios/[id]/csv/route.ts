import { db } from "@/server/db";
import { obterCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { gerarRelatorio } from "@/server/services/relatorios";
import { auditar } from "@/server/services/auditoria";

function celula(v: unknown, tipo?: string) {
  if (v === null || v === undefined) return "";
  let s: string;
  if (tipo === "moeda" && typeof v === "number") s = (v / 100).toFixed(2).replace(".", ",");
  else if (v instanceof Date) s = v.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  else if (tipo === "qtd") s = String(v).replace(".", ",");
  else s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita injeção de fórmula
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exportação CSV com as mesmas restrições da tela (mesma função de geração). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await obterCtx();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  try {
    exigir(ctx, "relatorio.exportar");
    const u = new URL(req.url);
    const f = Object.fromEntries([...u.searchParams.entries()].filter(([k]) => !["offset", "limite"].includes(k)));
    const { def, resultado } = await gerarRelatorio(db, ctx, id, { ...f, limite: 20000, offset: 0 });
    const linhas = [resultado.colunas.map((c) => celula(c.rotulo)).join(";"), ...resultado.linhas.map((l) => resultado.colunas.map((c) => celula(l[c.chave], c.tipo)).join(";"))];
    await auditar(db, ctx, { acao: "relatorio.exportado", entidadeTipo: "relatorio", entidadeId: id, depois: { filtros: f, linhas: resultado.linhas.length } });
    return new Response("﻿" + linhas.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="thermobras-${def.id}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response((e as Error).message || "Acesso negado", { status: 403 });
  }
}
