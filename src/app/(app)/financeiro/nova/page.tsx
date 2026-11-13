import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir, pode } from "@/server/auth/contexto";
import { listarCategorias, listarContas } from "@/server/services/financeiro";
import { listarFornecedores, opcoesClientes } from "@/server/services/cadastros";
import { profissional } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, Campo, PageHeader } from "@/components/ui";
import { hojeSP } from "@/lib/datas";
import { acaoNovaObrigacao } from "../actions";

export const metadata = { title: "Novo lançamento" };
export default async function Nova({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); exigir(ctx, "financeiro.lancar"); const sp = await searchParams;
  const nat = sp.natureza === "receber" ? "receber" : "pagar";
  const [cats, contas, clientes, forns, profs] = await Promise.all([listarCategorias(db, ctx, nat), listarContas(db, ctx), opcoesClientes(db, ctx).catch(() => []), listarFornecedores(db, ctx), db.select().from(profissional).where(and(eq(profissional.empresaId, ctx.empresaId), eq(profissional.ativo, true)))]);
  return (
    <div className="max-w-3xl">
      <PageHeader titulo={`Novo lançamento — ${nat === "receber" ? "a receber" : "a pagar"}`} voltar={{ href: `/financeiro/${nat}`, rotulo: "Voltar" }} subtitulo="Cobranças de OS e mensalidades são geradas na própria OS / no caixa (origem única). Use aqui para despesas e entradas avulsas." />
      <Card>
        <ActionForm action={acaoNovaObrigacao} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="natureza" value={nat} />
          <Campo rotulo="Categoria" nome="categoriaId" obrigatorio><select id="categoriaId" name="categoriaId" className="select" required><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.restrita ? " (restrita)" : ""}</option>)}</select></Campo>
          {nat === "receber" ? <Campo rotulo="Cliente" nome="clienteId" obrigatorio><select id="clienteId" name="clienteId" className="select" required><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            : <Campo rotulo="Fornecedor" nome="fornecedorId"><select id="fornecedorId" name="fornecedorId" className="select"><option value="">—</option>{forns.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>}
          {nat === "pagar" && <Campo rotulo="Ou profissional" nome="profissionalId"><select id="profissionalId" name="profissionalId" className="select"><option value="">—</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>}
          {nat === "pagar" && <Campo rotulo="Nº da OS (custo do serviço)" nome="osNumero" dica="Opcional: liga a despesa ao serviço para o relatório de custos"><input id="osNumero" name="osNumero" inputMode="numeric" className="input" placeholder="Ex.: 42" /></Campo>}
          {nat === "pagar" && <Campo rotulo="Ou beneficiário (texto)" nome="beneficiario"><input id="beneficiario" name="beneficiario" className="input" /></Campo>}
          <Campo rotulo="Descrição" nome="descricao" obrigatorio><input id="descricao" name="descricao" className="input" required /></Campo>
          <Campo rotulo="Valor bruto (R$)" nome="valor" obrigatorio><input id="valor" name="valor" className="input" required inputMode="decimal" /></Campo>
          <Campo rotulo="Desconto (R$)" nome="desconto" dica={pode(ctx, "financeiro.desconto") ? undefined : "Exige autorização do gestor"}><input id="desconto" name="desconto" className="input" disabled={!pode(ctx, "financeiro.desconto")} /></Campo>
          <Campo rotulo="Parcelas" nome="parcelas"><input id="parcelas" name="parcelas" type="number" min={1} max={36} defaultValue={1} className="input" /></Campo>
          <Campo rotulo="1º vencimento" nome="vencimento" obrigatorio><input id="vencimento" type="date" name="vencimento" defaultValue={hojeSP()} className="input" required /></Campo>
          <Campo rotulo="Competência (mês)" nome="competencia"><input id="competencia" type="month" name="competencia" defaultValue={hojeSP().slice(0, 7)} className="input" /></Campo>
          <Campo rotulo="Conta prevista" nome="contaId"><select id="contaId" name="contaId" className="select"><option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Documento" nome="documento"><input id="documento" name="documento" className="input" /></Campo>
          <div className="sm:col-span-2 rounded-2xl border border-white bg-white/50 p-3"><label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="legado" />Conta antiga, anterior à data de corte (implantação — não é venda nova)</label><input name="identificador" placeholder="Identificador único do documento antigo" className="input mt-2" /></div>
          <div className="sm:col-span-2"><Enviar>Registrar</Enviar><p className="hint">Lançamentos a pagar ficam aguardando aprovação do gestor. Registrar não movimenta dinheiro.</p></div>
        </ActionForm>
      </Card>
    </div>
  );
}
