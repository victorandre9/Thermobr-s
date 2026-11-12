"use server";
import { headers } from "next/headers";
import { executar, req, txt, lista, moeda, bool, int } from "@/server/acao";
import { db } from "@/server/db";
import * as U from "@/server/services/usuarios";
import { emitirRedefinicao } from "@/server/services/autenticacao";
import { salvarVaga } from "@/server/services/agenda";
import { salvarModeloChecklist } from "@/server/services/veiculos";
import { configurarCategoria } from "@/server/services/financeiro";
import { definirDataCorte, definirPoliticaFinanceira, salvarParametros } from "@/server/services/implantacao";
import { salvarFornecedor } from "@/server/services/cadastros";
import { executarRotina, type NomeRotina } from "@/server/services/rotinas";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import type { Escopo, Permissao } from "@/server/auth/permissoes";
import type { EstadoAcao } from "@/components/action-form";

const C = ["/configuracoes", "/configuracoes/usuarios", "/configuracoes/profissionais"];
const split = (s: string | null) => (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
export async function acaoNovoUsuario(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const vinc = txt(fd, "vinculo");
    const u = await U.criarUsuario(tx, ctx, { nome: req(fd, "nome", "nome"), email: req(fd, "email", "e-mail"), senhaInicial: req(fd, "senha", "senha inicial"), papeis: lista(fd, "papeis"), profissional: vinc ? { vinculo: vinc as "autonomo", funcao: txt(fd, "funcao") ?? "tecnico" } : null, profissionalExistenteId: txt(fd, "profissionalId") });
    return { msg: "Usuário criado (troca de senha obrigatória no primeiro acesso).", redirecionar: `/configuracoes/usuarios/${u.id}` };
  }, C);
}
export async function acaoUsuario(_: EstadoAcao, fd: FormData) {
  const id = String(fd.get("usuarioId"));
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "papeis") { await U.definirPapeis(tx, ctx, id, lista(fd, "papeis"), req(fd, "motivo", "motivo")); return "Papéis atualizados."; }
    if (op === "conceder") { await U.concederPermissao(tx, ctx, id, req(fd, "permissao") as Permissao, (txt(fd, "escopo") ?? "empresa") as Escopo, req(fd, "motivo", "motivo")); return "Permissão concedida."; }
    if (op === "revogar") { await U.revogarPermissao(tx, ctx, id, req(fd, "permissao"), txt(fd, "motivo") ?? "revogação"); return "Permissão revogada."; }
    if (op === "ativo") { await U.definirAtivo(tx, ctx, id, fd.get("ativo") === "1", req(fd, "motivo", "motivo")); return fd.get("ativo") === "1" ? "Usuário reativado." : "Usuário desativado (histórico preservado, sessões e acesso a anexos revogados)."; }
    if (op === "redefinir") { const t = await emitirRedefinicao(tx, ctx.empresaId, ctx.usuarioId, id); const h = await headers(); const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`; return `Link de uso único (1 hora) — entregue ao usuário: ${base}/redefinir-senha/${t}`; }
    return "—";
  }, [...C, `/configuracoes/usuarios/${id}`]);
}
export async function acaoProfissional(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const id = txt(fd, "id");
    if (!id) { await U.criarProfissional(tx, ctx, { nome: req(fd, "nome", "nome"), vinculo: req(fd, "vinculo") as "autonomo", funcao: txt(fd, "funcao") ?? "tecnico", telefone: txt(fd, "telefone") }); return "Profissional cadastrado."; }
    await U.atualizarProfissional(tx, ctx, id, { vinculo: (txt(fd, "vinculo") ?? undefined) as "autonomo" | undefined, funcao: txt(fd, "funcao") ?? undefined, telefone: txt(fd, "telefone"), competencias: split(txt(fd, "competencias")), regioes: split(txt(fd, "regioes")), ativo: fd.get("ativo") !== "0" }, txt(fd, "motivo") ?? undefined);
    return "Profissional atualizado.";
  }, C);
}
export async function acaoVaga(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await salvarVaga(tx, ctx, txt(fd, "id"), { nome: req(fd, "nome"), horaInicio: req(fd, "horaInicio"), horaFim: req(fd, "horaFim"), diasSemana: lista(fd, "dias").map(Number), ordem: int(fd, "ordem") ?? 0, ativo: fd.get("ativo") !== "0" }); return "Vaga salva."; }, ["/configuracoes/agenda", "/agenda"]);
}
export async function acaoModeloChecklist(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const itens = (txt(fd, "itens") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [descricao, criticidade = "media", foto = ""] = l.split("|").map((x) => x.trim()); return { descricao, criticidade: ["baixa", "media", "alta", "critica"].includes(criticidade) ? criticidade : "media", exigeFotoIrregular: /foto|sim/i.test(foto) }; });
    const m = await salvarModeloChecklist(tx, ctx, req(fd, "tipo") as "veiculo_saida", { nome: req(fd, "nome"), validadeHoras: int(fd, "validade") ?? 12, itens });
    return `Nova versão ${m.versao} publicada. Respostas antigas mantêm a versão usada.`;
  }, ["/configuracoes/checklists"]);
}
export async function acaoCategoria(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await configurarCategoria(tx, ctx, req(fd, "id"), { duplaAprovacaoAcimaCentavos: txt(fd, "limite") === null ? null : moeda(fd, "limite"), restrita: bool(fd, "restrita") }); return "Categoria atualizada."; }, ["/configuracoes/categorias"]);
}
export async function acaoImplantacao(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => {
    const op = req(fd, "op");
    if (op === "corte") { await definirDataCorte(tx, ctx, req(fd, "data", "data de corte")); return "Data de corte definida."; }
    if (op === "politica") { await definirPoliticaFinanceira(tx, ctx, fd.get("definida") === "1", txt(fd, "observacao") ?? ""); return "Política registrada."; }
    if (op === "parametros") {
      await salvarParametros(tx, ctx, "materiais", { prazoCustodiaDias: int(fd, "prazoCustodia") ?? 15 });
      await salvarParametros(tx, ctx, "ferramentas", { prazoDevolucaoDias: int(fd, "prazoFerramenta") ?? 7 });
      await salvarParametros(tx, ctx, "autonomos", { diaSemanaPrevisaoPagamento: int(fd, "diaPagamento") ?? 5 });
      await salvarParametros(tx, ctx, "veiculos", { checklistSaidaObrigatorio: bool(fd, "checklistObrig"), bloquearComIrregularidadeCritica: bool(fd, "bloquearCritica") });
      return "Parâmetros salvos.";
    }
    return "—";
  }, ["/configuracoes/implantacao", "/"]);
}
export async function acaoFornecedor(_: EstadoAcao, fd: FormData) {
  return executar(async (tx, ctx) => { await salvarFornecedor(tx, ctx, txt(fd, "id"), { nome: req(fd, "nome", "nome"), documento: txt(fd, "documento"), telefone: txt(fd, "telefone"), email: txt(fd, "email") }); return "Fornecedor salvo."; }, ["/configuracoes/fornecedores"]);
}
export async function acaoRotina(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const ctx = await exigirCtx();
  try { exigir(ctx, "configuracao.gerenciar"); const r = await executarRotina(db, String(fd.get("rotina")) as NomeRotina, ctx.empresaId, `usuario:${ctx.usuarioId}`); return { ok: r.status !== "erro", msg: `Resultado: ${r.status}`, erro: r.status === "erro" ? `Falhou: ${(r as { mensagem?: string }).mensagem}` : undefined }; }
  catch (e) { return { ok: false, erro: (e as Error).message }; }
}
