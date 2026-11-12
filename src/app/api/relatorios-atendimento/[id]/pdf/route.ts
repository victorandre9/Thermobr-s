import { db } from "@/server/db";
import { obterCtx } from "@/server/auth/sessao";
import { obterRelatorio, type ConteudoExterno } from "@/server/services/relatorio-atendimento";
import { gerarPdfRelatorio } from "@/server/pdf/relatorio";
import { getStorage } from "@/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await obterCtx();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  let r;
  try { r = await obterRelatorio(db, ctx, id); } catch { return new Response("Acesso negado", { status: 403 }); }
  const fotos: Array<{ nome: string; dados: Buffer; mime: string }> = [];
  for (const a of r.fotos) { if (!["image/jpeg", "image/png"].includes(a.mime)) continue; try { fotos.push({ nome: a.nomeArquivo, dados: await getStorage().ler(a.chaveStorage), mime: a.mime }); } catch { /* arquivo indisponível: omitido */ } }
  const c = r.r.conteudo as unknown as ConteudoExterno;
  const pdf = await gerarPdfRelatorio(c, { versao: r.r.versao, emitidoEm: r.r.emitidoEm, id: r.r.id, ciencia: { situacao: r.r.cienciaSituacao, nome: r.r.cienciaNome, em: r.r.cienciaEm, observacao: r.r.cienciaObservacao } }, fotos);
  const nome = c.escopo === "visita" ? `atendimento-OS${c.osNumero}-visita${c.visitaSequencia}-v${r.r.versao}.pdf` : `atendimento-OS${c.osNumero}-v${r.r.versao}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "private, no-store" } });
}
