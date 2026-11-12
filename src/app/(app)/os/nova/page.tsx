import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir, pode } from "@/server/auth/contexto";
import { opcoesClientes } from "@/server/services/cadastros";
import { opcoesOS } from "@/server/services/os";
import { clienteContato, clienteLocal, contrato, equipamento, material } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, Campo, PageHeader } from "@/components/ui";
import { OS_ORIGENS, PRIORIDADES, UNIDADE_LABEL } from "@/lib/dominio";
import { acaoCriarOS } from "../actions";

export const metadata = { title: "Nova OS" };

export default async function NovaOS({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); exigir(ctx, "os.gerenciar");
  const sp = await searchParams;
  const clientes = await opcoesClientes(db, ctx);
  const cid = sp.clienteId && clientes.some((c) => c.id === sp.clienteId) ? sp.clienteId : null;
  const [locais, contatos, eqs, contratos, oss] = cid ? await Promise.all([
    db.select().from(clienteLocal).where(eq(clienteLocal.clienteId, cid)), db.select().from(clienteContato).where(eq(clienteContato.clienteId, cid)),
    db.select().from(equipamento).where(and(eq(equipamento.clienteId, cid), eq(equipamento.ativo, true))), db.select().from(contrato).where(and(eq(contrato.clienteId, cid), eq(contrato.status, "ativo"))),
    opcoesOS(db, ctx, cid),
  ]) : [[], [], [], [], []];
  const mats = await db.select({ id: material.id, nome: material.nome, especificacao: material.especificacao, unidade: material.unidade }).from(material).where(and(eq(material.empresaId, ctx.empresaId), eq(material.ativo, true)));
  const verPreco = pode(ctx, "os.valores.ver"); const verCusto = pode(ctx, "os.custos.ver");
  return (
    <div className="max-w-4xl">
      <PageHeader titulo="Nova ordem de serviço" voltar={{ href: "/os", rotulo: "Ordens de serviço" }} subtitulo="Pedidos externos devem ser programados pela fila de Pedidos (preserva o vínculo com a origem)." />
      <Card titulo="1. Cliente" className="mb-4">
        <form className="flex flex-wrap items-end gap-2" action="/os/nova">
          <div className="min-w-64 flex-1"><label className="label" htmlFor="cl">Cliente</label><select id="cl" name="clienteId" defaultValue={cid ?? ""} className="select"><option value="">Selecione…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <button className="btn btn-ghost">Carregar locais e equipamentos</button>
        </form>
      </Card>
      {cid && (
        <ActionForm action={acaoCriarOS} className="space-y-4">
          <input type="hidden" name="clienteId" value={cid} />
          <Card titulo="2. Dados da OS">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Origem" nome="origem" obrigatorio><select id="origem" name="origem" className="select">{Object.entries(OS_ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo rotulo="Prioridade" nome="prioridade"><select id="prioridade" name="prioridade" defaultValue="normal" className="select">{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo rotulo="Contrato (se origem = contrato)" nome="contratoId"><select id="contratoId" name="contratoId" className="select"><option value="">—</option>{contratos.map((k) => <option key={k.id} value={k.id}>{k.numero}</option>)}</select></Campo>
              <Campo rotulo="OS original (se retorno/garantia)" nome="osOrigemId"><select id="osOrigemId" name="osOrigemId" className="select"><option value="">—</option>{oss.map((o) => <option key={o.id} value={o.id}>#{o.numero} — {o.descricao.slice(0, 40)}</option>)}</select></Campo>
              <Campo rotulo="Local" nome="localId"><select id="localId" name="localId" className="select"><option value="">—</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome} — {[l.logradouro, l.numero, l.bairro].filter(Boolean).join(", ")}</option>)}</select></Campo>
              <Campo rotulo="Contato" nome="contatoId"><select id="contatoId" name="contatoId" className="select"><option value="">—</option>{contatos.map((c) => <option key={c.id} value={c.id}>{c.nome} {c.telefone ?? ""}</option>)}</select></Campo>
            </div>
            <div className="mt-4"><Campo rotulo="Descrição da solicitação" nome="descricao" obrigatorio><textarea id="descricao" name="descricao" rows={3} required className="textarea" /></Campo></div>
            <fieldset className="mt-4"><legend className="label">Equipamentos envolvidos</legend>
              {eqs.length === 0 ? <p className="hint">Cliente sem equipamentos cadastrados.</p> : <div className="grid gap-1 sm:grid-cols-2">{eqs.map((e) => <label key={e.id} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="equipamentos" value={e.id} />{[e.identificacao, e.tipo, e.marca, e.modelo].filter(Boolean).join(" · ")}</label>)}</div>}
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Competências exigidas (separadas por vírgula)" nome="competencias" dica="Usadas na recomendação de técnicos. Ex.: split, vrf, eletrica"><input id="competencias" name="competencias" className="input" /></Campo>
              <Campo rotulo="Profissionais necessários" nome="qtdProfissionais"><input id="qtdProfissionais" name="qtdProfissionais" type="number" min={1} max={10} defaultValue={1} className="input" /></Campo>
            </div>
            <div className="mt-4"><Campo rotulo="Observações internas" nome="observacoes"><textarea id="observacoes" name="observacoes" rows={2} className="textarea" /></Campo></div>
            <label className="mt-3 flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="aprovada" />Serviço avulso já aprovado pelo cliente (sem marcar, fica em rascunho e não gera cobrança)</label>
          </Card>
          <Card titulo="3. Serviços e peças previstos">
            <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[110px_1fr_1fr_90px_80px_110px_110px]">
                <select name={`item${i}_tipo`} className="select" aria-label="Tipo"><option value="servico">Serviço</option><option value="peca">Peça</option><option value="material">Material</option></select>
                <input name={`item${i}_descricao`} placeholder="Descrição" className="input" aria-label="Descrição" />
                <select name={`item${i}_materialId`} className="select" aria-label="Material do cadastro"><option value="">(material do cadastro)</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nome} {m.especificacao ?? ""} ({UNIDADE_LABEL[m.unidade]})</option>)}</select>
                <input name={`item${i}_quantidade`} defaultValue="1" className="input" aria-label="Quantidade" />
                <select name={`item${i}_unidade`} className="select" aria-label="Unidade">{Object.keys(UNIDADE_LABEL).map((u) => <option key={u}>{u}</option>)}</select>
                {verPreco ? <input name={`item${i}_preco`} placeholder="Preço un." className="input" aria-label="Preço unitário" /> : <span className="hint self-center">Preço: restrito</span>}
                {verCusto ? <input name={`item${i}_custo`} placeholder="Custo un." className="input" aria-label="Custo unitário" /> : <span />}
              </div>
            ))}</div>
            <p className="hint mt-2">Quantidade fracionada só em unidades fracionáveis (m, kg, L). Unidade do material do cadastro é a mesma da linha.</p>
          </Card>
          <Enviar className="btn btn-primary btn-lg">Criar OS</Enviar>
        </ActionForm>
      )}
    </div>
  );
}
