import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterCliente } from "@/server/services/cadastros";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, Dinheiro, PageHeader } from "@/components/ui";
import { EtapaOS } from "@/components/status";
import { FormCliente } from "@/components/form-cliente";
import { fmtDia } from "@/lib/datas";
import { listarParcelas } from "@/server/services/financeiro";
import { Badge } from "@/components/ui";
import { acaoContato, acaoEquipamento, acaoLocal } from "../actions";

export const metadata = { title: "Cliente" };
export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); const { id } = await params;
  const d = await obterCliente(db, ctx, id);
  const ger = pode(ctx, "cliente.gerenciar");
  const operacional = pode(ctx, "agenda.ver", "empresa") || pode(ctx, "os.gerenciar");
  const fin = pode(ctx, "financeiro.ver") ? await listarParcelas(db, ctx, { natureza: "receber", situacao: "abertas", clienteId: id, limite: 50 }) : null;
  const vencido = fin ? fin.rows.filter((p) => p.situacao.vencida).reduce((a, p) => a + p.saldo, 0) : 0;
  const H = <input type="hidden" name="clienteId" value={id} />;
  const cardFin = fin && (
        <Card titulo="Financeiro do cliente" pad={false}>
          <div className="grid grid-cols-2 divide-x divide-white border-b border-white text-center">
            <Link href={`/financeiro/receber?situacao=abertas&clienteId=${id}`} className="p-3"><div className="text-[12px] text-muted">Em aberto</div><div className="num text-[16px] font-bold text-navy"><Dinheiro v={fin.somaSaldo} /></div></Link>
            <Link href={`/financeiro/receber?situacao=vencidas&clienteId=${id}`} className="p-3"><div className="text-[12px] text-muted">Vencido</div><div className={`num text-[16px] font-bold ${vencido ? "text-bad" : "text-navy"}`}><Dinheiro v={vencido} /></div></Link>
          </div>
          {fin.rows.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">Nenhuma conta em aberto deste cliente.</p> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Saldo</th><th>Situação</th></tr></thead>
              <tbody>{fin.rows.map((p) => <tr key={p.parcelaId}><td className="whitespace-nowrap">{fmtDia(p.vencimento)}</td><td><Link href={`/financeiro/obrigacoes/${p.obrigacaoId}`} className="font-medium text-navy hover:underline">{p.descricao}</Link></td><td className="font-semibold"><Dinheiro v={p.saldo} /></td><td><Badge tom={p.situacao.vencida ? "critico" : "info"}>{p.situacao.rotulo}</Badge></td></tr>)}</tbody></table></div>
          )}
          {pode(ctx, "financeiro.cobranca") && vencido > 0 && <div className="border-t border-white px-4 py-2.5"><Link href="/financeiro/cobranca" className="btn btn-ghost btn-sm">Registrar contato de cobrança</Link></div>}
        </Card>
  );
  return (
    <div className="space-y-5">
      <PageHeader titulo={d.cliente.nome} voltar={{ href: "/clientes", rotulo: "Clientes" }} subtitulo={[d.cliente.documento, d.cliente.telefone, d.cliente.email].filter(Boolean).join(" · ")} acoes={pode(ctx, "os.gerenciar") && <Link className="btn btn-primary" href={`/os/nova?clienteId=${id}`}>Nova OS</Link>} />
      {!operacional && cardFin}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Locais">
          <ul className="space-y-2 text-[13.5px]">{d.locais.map((l) => <li key={l.id}><b>{l.nome}</b> — {[l.logradouro, l.numero, l.complemento, l.bairro, l.cidade, l.uf].filter(Boolean).join(", ") || "sem endereço"}{l.instrucoesAcesso && <div className="text-[12px] text-muted">Acesso: {l.instrucoesAcesso}</div>}</li>)}</ul>
          {ger && <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Incluir local</summary>
            <ActionForm action={acaoLocal} className="mt-2 grid gap-2 sm:grid-cols-2" resetar>{H}{["nome:Nome do local", "logradouro:Logradouro", "numero:Número", "complemento:Complemento", "bairro:Bairro", "cidade:Cidade", "uf:UF", "cep:CEP", "instrucoesAcesso:Instruções de acesso"].map((x) => { const [n, r] = x.split(":"); return <input key={n} name={n} placeholder={r} aria-label={r} className="input" required={n === "nome"} />; })}<Enviar className="btn btn-ghost">Incluir</Enviar></ActionForm></details>}
        </Card>
        <Card titulo="Contatos">
          <ul className="space-y-1 text-[13.5px]">{d.contatos.map((c) => <li key={c.id}><b>{c.nome}</b> {c.cargo && `(${c.cargo})`} · {c.telefone ?? "—"} · {c.email ?? ""}{c.principal && " · principal"}</li>)}</ul>
          {ger && <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Incluir contato</summary>
            <ActionForm action={acaoContato} className="mt-2 grid gap-2 sm:grid-cols-2" resetar>{H}<input name="nome" placeholder="Nome" className="input" required /><input name="telefone" placeholder="Telefone" className="input" /><input name="email" placeholder="E-mail" className="input" /><input name="cargo" placeholder="Cargo" className="input" /><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="principal" />Principal</label><Enviar className="btn btn-ghost">Incluir</Enviar></ActionForm></details>}
        </Card>
        {operacional && <Card titulo="Equipamentos">
          <ul className="space-y-1 text-[13.5px]">{d.equipamentos.map((e) => <li key={e.id}><b>{e.identificacao ?? e.tipo}</b> · {[e.tipo, e.marca, e.modelo, e.capacidadeBtu && `${e.capacidadeBtu} BTU`, e.numeroSerie && `S/N ${e.numeroSerie}`].filter(Boolean).join(" · ")}</li>)}</ul>
          {ger && <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Incluir equipamento</summary>
            <ActionForm action={acaoEquipamento} className="mt-2 grid gap-2 sm:grid-cols-2" resetar>{H}<input name="identificacao" placeholder="Identificação (ex.: Sala 2)" className="input" /><input name="tipo" placeholder="Tipo (split, cassete, VRF…)" className="input" required />
              <select name="localId" className="select" aria-label="Local"><option value="">Local…</option>{d.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select><input name="marca" placeholder="Marca" className="input" /><input name="modelo" placeholder="Modelo" className="input" /><input name="capacidadeBtu" placeholder="BTU" className="input" /><input name="numeroSerie" placeholder="Nº de série" className="input" /><Enviar className="btn btn-ghost">Incluir</Enviar></ActionForm></details>}
        </Card>}
        <Card titulo="Contratos">
          {d.contratos.length === 0 ? <p className="text-[13px] text-muted">Sem contratos.</p> : <ul className="space-y-1 text-[13.5px]">{d.contratos.map((k) => <li key={k.id}><b>{k.numero}</b> · {k.status} · desde {fmtDia(k.inicio)}{pode(ctx, "contrato.valores.ver") && <> · <Dinheiro v={k.valorMensalCentavos} />/mês</>}</li>)}</ul>}
        </Card>
      </div>
      {operacional && cardFin}
      <Card titulo="Histórico de OS" pad={false}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>OS</th><th>Descrição</th><th>Situação</th><th>Abertura</th></tr></thead>
          <tbody>{d.oss.map((o) => <tr key={o.id}><td><Link className="font-semibold text-navy" href={`/os/${o.id}`}>#{o.numero}</Link></td><td>{o.descricao}</td><td><EtapaOS e={o.etapa} /></td><td>{fmtDia(o.criadoEm.toISOString().slice(0, 10))}</td></tr>)}</tbody></table></div>
      </Card>
      {ger && <Card titulo="Editar cadastro"><FormCliente c={d.cliente} /></Card>}
    </div>
  );
}
