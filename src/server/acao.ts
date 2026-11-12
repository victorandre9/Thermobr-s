import "server-only";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "./db";
import { exigirCtx } from "./auth/sessao";
import type { Ctx } from "./auth/contexto";
import { ErroAcesso, ErroNaoEncontrado, ErroNegocio, traduzirErroBanco } from "./erros";
import type { EstadoAcao } from "@/components/action-form";
import { parseBRL } from "@/lib/money";

/** Executa uma ação de escrita em transação com o contexto autenticado; converte erros em mensagens acionáveis. */
export async function executar(fn: (tx: Tx, ctx: Ctx) => Promise<string | { msg: string; redirecionar?: string } | void>, revalidar: string[] = []): Promise<EstadoAcao> {
  const ctx = await exigirCtx();
  try {
    const r = await db.transaction((tx) => fn(tx, ctx));
    for (const p of revalidar) revalidatePath(p);
    const msg = typeof r === "string" ? r : r?.msg ?? "Salvo.";
    return { ok: true, msg, redirecionar: typeof r === "object" && r ? r.redirecionar : undefined, nonce: Date.now() };
  } catch (e) {
    const t = traduzirErroBanco(e);
    if (t instanceof ErroNegocio || t instanceof ErroAcesso || t instanceof ErroNaoEncontrado) return { ok: false, erro: t.message, nonce: Date.now() };
    console.error("[acao] erro inesperado", (e as Error)?.message);
    return { ok: false, erro: "Não foi possível concluir a operação. Tente novamente; se persistir, avise o gestor.", nonce: Date.now() };
  }
}

// ----- leitura de FormData
export const txt = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() !== "" ? v.trim() : null; };
export const req = (fd: FormData, k: string, rotulo = k) => { const v = txt(fd, k); if (v === null) throw new ErroNegocio(`Preencha: ${rotulo}.`, k); return v; };
export const int = (fd: FormData, k: string) => { const v = txt(fd, k); if (v === null) return null; const n = Number(v.replace(/\./g, "")); if (!Number.isInteger(n)) throw new ErroNegocio(`Número inválido em ${k}.`); return n; };
export const moeda = (fd: FormData, k: string, rotulo = k) => { const v = parseBRL(txt(fd, k)); if (v !== null && Number.isNaN(v)) throw new ErroNegocio(`Valor inválido: ${rotulo}. Use o formato 1.234,56.`); return v; };
export const moedaReq = (fd: FormData, k: string, rotulo = k) => { const v = moeda(fd, k, rotulo); if (v === null) throw new ErroNegocio(`Informe ${rotulo}.`); return v; };
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1" || fd.get(k) === "true";
export const lista = (fd: FormData, k: string) => fd.getAll(k).filter((x): x is string => typeof x === "string" && x !== "");
export const idem = (fd: FormData) => txt(fd, "_idem");
