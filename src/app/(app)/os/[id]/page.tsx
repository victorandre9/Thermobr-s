import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { CalendarPlus, FileDown } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterOS } from "@/server/services/os";
import { conciliacaoOS, listarPosicoes } from "@/server/services/materiais";
import { listarServicosAutonomos } from "@/server/services/autonomos";
import { listarRelatoriosOS, evidenciasDisponiveis } from "@/server/services/relatorio-atendimento";
import { listarAnexos } from "@/server/services/anexos";
import { prontidaoVisita } from "@/server/services/prontidao";
import { auditoria, material, obrigacao, usuario } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Campo, Dinheiro, Dl, PageHeader, Qtd, Vazio } from "@/components/ui";
import { EtapaOS, Prioridade, SituacaoVisita } from "@/components/status";
import { EnviarAnexo, ListaAnexos } from "@/components/anexos";
import { OS_ORIGENS, SITUACAO_COMERCIAL, SITUACAO_MATERIAL, SITUACAO_CONFERENCIA, AUTONOMO_SITUACAO, MOTIVOS_RESULTADO, OBRIGACAO_APROVACAO, rotulo } from "@/lib/dominio";
import { fmtDataHora, fmtHora, hojeSP } from "@/lib/datas";
import { centavosParaInput } from "@/lib/money";
import { valorItem } from "@/lib/quantidade";
import * as A from "../actions";

export const metadata = { title: "OS" };

export default async function DetalheOS({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx();
  const { id } = await params;
  const d = await obterOS(db, ctx, id);
  const o = d.os;
  const gerenciar = pode(ctx, "os.gerenciar"); const agenda = pode(ctx, "agenda.gerenciar");
  const operacional = pode(ctx, "agenda.ver", "empresa") || gerenciar;
  const [conc, posicoes, mats, autonomos, relatorios, evid, anexosOS, prontidoes, hist, obrigs, usuarios] = await Promise.all([
    pode(ctx, "material.ver", "empresa") ? conciliacaoOS(db, ctx, id) : Promise.resolve([]),
    pode(ctx, "material.movimentar") ? listarPosicoes(db, ctx) : Promise.resolve([]),
    pode(ctx, "material.movimentar") ? db.select({ id: material.id, nome: material.nome, especificacao: material.especificacao, unidade: material.unidade }).from(material).where(eq(material.empresaId, ctx.empresaId)) : Promise.resolve([]),
    pode(ctx, "autonomo.valores.ver", "empresa") ? listarServicosAutonomos(db, ctx).then((r) => r.filter((x) => x.s.osId === id)) : Promise.resolve([]),
    listarRelatoriosOS(db, ctx, id), pode(ctx, "os.conferir") ? evidenciasDisponiveis(db, ctx, id, null) : Promise.resolve([]),
    listarAnexos(db, ctx, "os", id),
    Promise.all(d.visitas.filter((v) => v.situacao === "agendada").map(async (v) => ({ id: v.id, p: await prontidaoVisita(db, ctx, v.id) }))),
    pode(ctx, "os.ver", "empresa") ? db.select({ a: auditoria, nome: usuario.nome }).from(auditoria).leftJoin(usuario, eq(usuario.id, auditoria.usuarioId)).where(and(eq(auditoria.empresaId, ctx.empresaId), eq(auditoria.entidadeTipo, "os"), eq(auditoria.entidadeId, id))).orderBy(desc(auditoria.em)).limit(30) : Promise.resolve([]),
    pode(ctx, "financeiro.ver") ? db.select().from(obrigacao).where(eq(obrigacao.osId, id)) : Promise.resolve([]),
    gerenciar ? db.select({ id: usuario.id, nome: usuario.nome }).from(usuario).where(and(eq(usuario.empresaId, ctx.empresaId), eq(usuario.ativo, true))) : Promise.resolve([]),
  ]);
  const extras = d.itens.filter((i) => i.situacao === "extra_solicitado");
  const encerrada = ["encerrada", "cancelada"].includes(o.etapa);
  const H = <input type="hidden" name="osId" value={id} />;
  return (
    <div className="space-y-5">
      <PageHeader voltar={operacional ? { href: "/os", rotulo: "Ordens de serviço" } : { href: "/os?situacao=para_cobrar", rotulo: "OS para cobrar" }} titulo={`OS #${o.numero} — ${d.cliente.nome}`}
        subtitulo={<span className="flex flex-wrap items-center gap-2"><EtapaOS e={o.etapa} /><Prioridade p={o.prioridade} /><Badge tom="neutro" icone={false}>{rotulo(OS_ORIGENS, o.origem)}</Badge><Badge tom={o.situacaoComercial === "aprovada" ? "ok" : "atencao"}>{rotulo(SITUACAO_COMERCIAL, o.situacaoComercial)}</Badge>{o.demo && <Badge tom="neutro" icone={false}>demonstração</Badge>}</span>}
        acoes={<>
          {gerenciar && o.situacaoComercial === "rascunho" && <ActionForm action={A.acaoAprovarOS}>{H}<Enviar className="btn btn-ok">Aprovar serviço</Enviar></ActionForm>}
          {agenda && !encerrada && <ActionForm action={A.acaoNovaVisita}>{H}<Enviar className="btn btn-primary"><CalendarPlus size={16} />Nova visita</Enviar></ActionForm>}
        </>} />
      {o.etapa === "servico_concluido" && pode(ctx, "os.conferir") && (
        <Card titulo="Conferência administrativa pendente">
          <p className="mb-3 text-[13.5px] text-muted">O encerramento técnico foi registrado. Confira fichas, fotos e materiais antes de encerrar. Encerrar a OS não altera cobranças nem baixas.</p>
          <ActionForm action={A.acaoConferirOS} className="flex flex-wrap items-end gap-2">{H}<input name="observacao" placeholder="Observação (opcional)" className="input max-w-md" /><Enviar className="btn btn-ok">Conferir e encerrar OS</Enviar></ActionForm>
        </Card>
      )}
      {extras.length > 0 && (
        <Card titulo={`Extras solicitados pelo técnico (${extras.length})`}>
          {extras.map((it) => (
            <ActionForm key={it.id} action={A.acaoExtra} className="mb-3 flex flex-wrap items-end gap-2 border-b border-line pb-3">{H}<input type="hidden" name="itemId" value={it.id} />
              <div className="min-w-56 flex-1"><div className="font-semibold">{it.descricao}</div><div className="text-[12.5px] text-muted"><Qtd v={it.quantidade} u={it.unidade} /> · nenhuma cobrança é gerada até a aprovação</div></div>
              {pode(ctx, "os.valores.ver") && <input name="preco" placeholder="Preço unitário" className="input w-36" aria-label="Preço" />}
              <input name="motivo" placeholder="Observação" className="input w-48" aria-label="Observação" />
              {pode(ctx, "os.extra.aprovar") ? <><Enviar className="btn btn-ok btn-sm" name="decisao" value="aprovar">Aprovar</Enviar><Enviar className="btn btn-danger btn-sm" name="decisao" value="recusar">Recusar</Enviar></> : <span className="hint">Aguardando aprovação</span>}
            </ActionForm>
          ))}
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card titulo="Dados">
            <Dl itens={[["Cliente", d.cliente.nome], ["Local", d.local ? `${d.local.nome} — ${[d.local.logradouro, d.local.numero, d.local.bairro, d.local.cidade].filter(Boolean).join(", ")}` : "—"], ["Contato", d.contato ? `${d.contato.nome} ${d.contato.telefone ?? ""}` : d.cliente.telefone],
              ["Descrição", o.descricao], ["Equipamentos", d.equipamentos.map((e) => [e.identificacao, e.tipo, e.marca, e.modelo].filter(Boolean).join(" · ")).join("; ") || "—"],
              ["Contrato", d.contrato ? `${d.contrato.numero}${d.contrato.cobertura ? " — " + d.contrato.cobertura : ""}` : "—"], ["OS de origem (retorno)", d.osOrigem ? <Link className="text-ice-strong underline" href={`/os/${d.osOrigem.id}`}>#{d.osOrigem.numero}</Link> : "—"],
              ["Pedido externo", d.pedido ? <Link className="text-ice-strong underline" href={`/pedidos/${d.pedido.id}`}>{d.pedido.origem}:{d.pedido.idExterno}</Link> : o.referenciaExterna ?? "—"],
              ["Material", rotulo(SITUACAO_MATERIAL, o.situacaoMaterial)], ["Conferência", rotulo(SITUACAO_CONFERENCIA, o.situacaoConferencia)],
              ["Competências exigidas", o.competenciasExigidas.join(", ") || "Não cadastradas"], ["Profissionais necessários", String(o.qtdProfissionais)],
              ["Aberta por", `${d.abertaPorNome} em ${fmtDataHora(o.criadoEm)}`], ["Responsável pela resolução", d.responsavelNome ?? "—"], ["Próxima ação", o.proximaAcao ?? "—"], ["Retornos vinculados", d.retornos.map((r) => `#${r.numero}`).join(", ") || "—"]]} />
            {gerenciar && !encerrada && (
              <details className="mt-4"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Editar dados operacionais</summary>
                <ActionForm action={A.acaoAtualizarOS} className="mt-3 grid gap-3 sm:grid-cols-2">{H}<input type="hidden" name="versao" value={o.versao} />
                  <Campo rotulo="Descrição" nome="descricao"><textarea id="descricao" name="descricao" defaultValue={o.descricao} className="textarea" rows={2} /></Campo>
                  <Campo rotulo="Observações internas" nome="observacoes"><textarea id="observacoes" name="observacoes" defaultValue={o.observacoes ?? ""} className="textarea" rows={2} /></Campo>
                  <Campo rotulo="Prioridade" nome="prioridade"><select id="prioridade" name="prioridade" defaultValue={o.prioridade} className="select">{["baixa", "normal", "alta", "urgente"].map((p) => <option key={p}>{p}</option>)}</select></Campo>
                  <Campo rotulo="Situação de material" nome="situacaoMaterial"><select id="situacaoMaterial" name="situacaoMaterial" defaultValue={o.situacaoMaterial} className="select">{Object.entries(SITUACAO_MATERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                  <Campo rotulo="Responsável pela resolução" nome="responsavelResolucaoId"><select id="responsavelResolucaoId" name="responsavelResolucaoId" defaultValue={o.responsavelResolucaoId ?? ""} className="select"><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Campo>
                  <Campo rotulo="Próxima ação" nome="proximaAcao"><input id="proximaAcao" name="proximaAcao" defaultValue={o.proximaAcao ?? ""} className="input" /></Campo>
                  <Campo rotulo="Prazo da próxima ação" nome="proximaAcaoEm"><input id="proximaAcaoEm" type="date" name="proximaAcaoEm" defaultValue={o.proximaAcaoEm ?? ""} className="input" /></Campo>
                  <Campo rotulo="Motivo da situação" nome="motivoEtapa"><input id="motivoEtapa" name="motivoEtapa" defaultValue={o.motivoEtapa ?? ""} className="input" /></Campo>
                  <Campo rotulo="Competências exigidas" nome="competencias"><input id="competencias" name="competencias" defaultValue={o.competenciasExigidas.join(", ")} className="input" /></Campo>
                  <Campo rotulo="Profissionais necessários" nome="qtdProfissionais"><input id="qtdProfissionais" type="number" min={1} name="qtdProfissionais" defaultValue={o.qtdProfissionais} className="input" /></Campo>
                  <div className="sm:col-span-2"><Enviar>Salvar</Enviar><p className="hint">Se outro usuário alterou esta OS depois que você abriu a tela, a gravação é recusada para não sobrescrever.</p></div>
                </ActionForm>
                <ActionForm action={A.acaoCancelarOS} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3" confirmar="Cancelar esta OS? Visitas futuras serão canceladas; registros realizados são preservados.">{H}<input name="motivo" required placeholder="Motivo do cancelamento" className="input max-w-sm" /><Enviar className="btn btn-danger">Cancelar OS</Enviar></ActionForm>
              </details>
            )}
          </Card>

          {operacional && <Card titulo="Visitas" pad={false}>
            {d.visitas.length === 0 ? <Vazio titulo="Nenhuma visita">Crie uma visita para programar o atendimento.</Vazio> : (
              <ul className="divide-y divide-line">{d.visitas.map((v) => {
                const pr = prontidoes.find((p) => p.id === v.id)?.p;
                return (
                  <li key={v.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><span className="font-semibold text-navy">Visita {v.sequencia}</span><SituacaoVisita s={v.situacao} r={v.resultado} />{pr && <Badge tom={pr.pronta ? "ok" : "critico"}>{pr.situacao}</Badge>}</div>
                      <div className="flex gap-2"><Link className="btn btn-ghost btn-sm" href={`/visitas/${v.id}`}>Abrir</Link>{agenda && ["nao_agendada", "agendada"].includes(v.situacao) && <Link className="btn btn-primary btn-sm" href={`/os/${id}/programar?visitaId=${v.id}`}>{v.situacao === "agendada" ? "Reagendar" : "Programar"}</Link>}</div>
                    </div>
                    <div className="mt-1 text-[13px] text-text-2">{v.inicioPrevisto ? `${fmtDataHora(v.inicioPrevisto)} – ${fmtHora(v.fimPrevisto)}` : "Sem data"} · {v.participantes.map((p) => `${p.nome}${p.papel === "responsavel" ? " (resp.)" : ""}`).join(", ") || "sem equipe"}</div>
                    {v.checkinEm && <div className="text-[12.5px] text-muted">Realizado: {fmtDataHora(v.checkinEm)} – {v.checkoutEm ? fmtHora(v.checkoutEm) : "em andamento"}</div>}
                    {v.motivoResultado && <div className="mt-1 text-[12.5px]"><b>{rotulo(MOTIVOS_RESULTADO, v.motivoResultado)}</b>: {v.pendenciaDescricao} → {v.proximaAcao}</div>}
                    {pr && !pr.pronta && <ul className="mt-2 space-y-1 text-[12.5px]">{pr.itens.filter((i) => i.status === "impeditivo").map((i) => (
                      <li key={i.codigo} className="flex flex-wrap items-center gap-2"><Badge tom="critico">{i.rotulo}</Badge>{i.detalhe} <span className="text-muted">({i.responsavel}{i.proximaAcao ? ` · ${i.proximaAcao}` : ""})</span>
                        {pode(ctx, "os.conferir") && !i.codigo.startsWith("veiculo:") && <ActionForm action={A.acaoLiberarProntidao} className="flex gap-1">{H}<input type="hidden" name="visitaId" value={v.id} /><input type="hidden" name="item" value={i.codigo} /><input name="justificativa" placeholder="Justificativa da exceção" className="input !w-56 !py-1 text-[12px]" required /><Enviar className="btn btn-ghost btn-sm">Liberar</Enviar></ActionForm>}
                      </li>))}</ul>}
                    {agenda && v.situacao === "agendada" && <details className="mt-2"><summary className="cursor-pointer text-[12.5px] text-muted">Cancelar visita</summary><ActionForm action={A.acaoCancelarVisita} className="mt-2 flex gap-2">{H}<input type="hidden" name="visitaId" value={v.id} /><input name="motivo" placeholder="Motivo" required className="input max-w-sm" /><Enviar className="btn btn-danger btn-sm">Cancelar visita</Enviar></ActionForm></details>}
                  </li>
                );
              })}</ul>
            )}
          </Card>}

          <Card titulo="Serviços e peças">
            {d.itens.length === 0 ? <p className="text-[13px] text-muted">Nenhum item.</p> : (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Item</th><th>Qtd.</th><th>Situação</th>{d.verPreco && <th>Preço un.</th>}{d.verPreco && <th>Total</th>}{d.verCusto && <th>Custo un.</th>}</tr></thead>
                <tbody>{d.itens.map((i) => (
                  <tr key={i.id}><td>{i.descricao}<div className="text-[12px] text-muted">{i.tipo}{i.incluidoContrato ? " · incluso no contrato" : ""}</div></td><td><Qtd v={i.quantidade} u={i.unidade} /></td><td className="text-[12.5px]">{i.situacao}</td>
                    {d.verPreco && <td>{i.precoUnitarioCentavos === null ? <span className="text-[12px] font-semibold text-warn">Sem preço (desconhecido)</span> : <Dinheiro v={i.precoUnitarioCentavos} />}</td>}
                    {d.verPreco && <td><Dinheiro v={i.precoUnitarioCentavos === null ? null : valorItem(i.precoUnitarioCentavos, i.quantidade)} /></td>}
                    {d.verCusto && <td><Dinheiro v={i.custoUnitarioCentavos} /></td>}</tr>
                ))}</tbody></table></div>
            )}
            {d.verPreco && d.totalPrevistoCentavos !== null && <p className="mt-2 text-right text-[13.5px]">Total previsto (sem itens de contrato): <b><Dinheiro v={d.totalPrevistoCentavos} /></b></p>}
            {gerenciar && !encerrada && (
              <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Incluir item</summary>
                <ActionForm action={A.acaoItem} className="mt-2 grid gap-2 sm:grid-cols-[110px_1fr_80px_80px_110px_auto]" resetar>{H}
                  <select name="tipo" className="select" aria-label="Tipo"><option value="servico">Serviço</option><option value="peca">Peça</option><option value="material">Material</option></select>
                  <input name="descricao" placeholder="Descrição" className="input" required aria-label="Descrição" /><input name="quantidade" defaultValue="1" className="input" aria-label="Quantidade" />
                  <select name="unidade" className="select" aria-label="Unidade">{["un", "m", "kg", "l", "cx", "rolo", "par"].map((u) => <option key={u}>{u}</option>)}</select>
                  {d.verPreco ? <input name="preco" placeholder="Preço un." className="input" aria-label="Preço" /> : <span />}<Enviar className="btn btn-ghost">Incluir</Enviar>
                </ActionForm>
              </details>
            )}
          </Card>

          {operacional && pode(ctx, "material.ver", "empresa") && (
            <Card titulo="Materiais da OS — conciliação">
              {conc.length === 0 ? <p className="text-[13px] text-muted">Nenhum material previsto ou movimentado.</p> : (
                <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Material</th><th>Previsto</th><th>Reservado</th><th>Entregue</th><th>Consumo inf. / validado</th><th>Devol. inf. / conferida</th><th>Perdas</th><th>Custódia</th><th>A localizar</th></tr></thead>
                  <tbody>{conc.map((l) => (
                    <tr key={l.materialId}><td>{l.nome}<div className="text-[12px] text-muted">{l.especificacao}</div></td><td><Qtd v={l.previsto} u={l.unidade} /></td><td><Qtd v={l.reservado} u={l.unidade} /></td>
                      <td><Qtd v={l.entregue} u={l.unidade} />{Number(l.emTransito) > 0 && <div className="text-[11.5px] text-warn">+{l.emTransito} aguardando confirmação</div>}</td>
                      <td><Qtd v={l.consumoInformado} /> / <b><Qtd v={l.consumoValidado} /></b></td><td><Qtd v={l.devolucaoInformada} /> / <b><Qtd v={l.devolucaoConferida} /></b></td><td><Qtd v={l.perdasAprovadas} /></td>
                      <td><Qtd v={l.saldoCustodia} u={l.unidade} />{Number(l.custodiaAutorizada) > 0 && <div className="text-[11.5px] text-muted">{l.custodiaAutorizada} autorizada</div>}</td>
                      <td>{Number(l.aLocalizar) > 0 ? <Badge tom="atencao">{l.aLocalizar} {l.unidade}</Badge> : l.conciliado ? <Badge tom="ok">Conciliado</Badge> : <Badge tom="info">Em aberto</Badge>}</td></tr>
                  ))}</tbody></table></div>
              )}
              <p className="hint mt-2">Estados não são somados como movimentos: custódia = entregue + transf. − consumo validado − devolução conferida − perdas − transf. saída. Diferenças são investigadas, não baixadas automaticamente.</p>
              {pode(ctx, "material.movimentar") && !encerrada && (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <ActionForm action={A.acaoReservarMaterial} className="space-y-2 rounded-lg border border-line p-3" resetar>{H}<div className="text-[13px] font-semibold">Reservar do estoque</div>
                    <select name="materialId" className="select" required aria-label="Material"><option value="">Material…</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nome} {m.especificacao ?? ""} ({m.unidade})</option>)}</select>
                    <div className="flex gap-2"><input name="quantidade" placeholder="Qtd." className="input" required aria-label="Quantidade" /><select name="posicaoId" className="select" aria-label="Posição">{posicoes.filter((p) => p.tipo === "almoxarifado" || p.tipo === "veiculo").map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <Enviar className="btn btn-ghost btn-sm">Reservar</Enviar>
                  </ActionForm>
                  {pode(ctx, "material.conferir") && conc.some((l) => Number(l.aLocalizar) > 0) && (
                    <ActionForm action={A.acaoCustodiaRemanescente} className="space-y-2 rounded-lg border border-line p-3">{H}<div className="text-[13px] font-semibold">Autorizar custódia remanescente</div>
                      <select name="materialId" className="select" aria-label="Material">{conc.filter((l) => Number(l.aLocalizar) > 0).map((l) => <option key={l.materialId} value={l.materialId}>{l.nome} ({l.aLocalizar} {l.unidade})</option>)}</select>
                      <select name="profissionalId" className="select" aria-label="Custodiante">{d.visitas.flatMap((v) => v.participantes).filter((p, i, a) => a.findIndex((x) => x.profissionalId === p.profissionalId) === i).map((p) => <option key={p.profissionalId} value={p.profissionalId}>{p.nome}</option>)}</select>
                      <div className="flex gap-2"><input name="quantidade" placeholder="Qtd." className="input" required /><input name="justificativa" placeholder="Justificativa" className="input" required /></div>
                      <Enviar className="btn btn-ghost btn-sm">Autorizar</Enviar>
                    </ActionForm>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {pode(ctx, "financeiro.ver") && pode(ctx, "os.valores.ver") && (
            <div id="cobranca" className="scroll-mt-20"><Card titulo="Cobrança">
              {obrigs.length === 0 ? <p className="text-[13px] text-muted">{o.origem === "avulso" ? "Nenhuma conta a receber gerada." : "Origem sem cobrança automática: visita de contrato e retorno não geram nova venda. Apenas extras aprovados podem ser cobrados."}</p> : (
                <ul className="space-y-1 text-[13px]">{obrigs.map((ob) => <li key={ob.id}><Link href={`/financeiro/obrigacoes/${ob.id}`} className="font-semibold text-ice-strong hover:underline">{ob.descricao}</Link> · <Dinheiro v={ob.valorBrutoCentavos - ob.descontoCentavos} /> · {rotulo(OBRIGACAO_APROVACAO, ob.situacaoAprovacao)}</li>)}</ul>
              )}
              {pode(ctx, "financeiro.lancar") && o.situacaoComercial === "aprovada" && (
                <ActionForm action={A.acaoCobranca} className="mt-3 space-y-2 border-t border-line pt-3">{H}
                  <div className="text-[13px] font-semibold">Gerar conta a receber</div>
                  <select name="itemExtraId" className="select" aria-label="Origem"><option value="">{o.origem === "avulso" ? "Serviço principal da OS" : "(selecione um extra aprovado)"}</option>{d.itens.filter((i) => i.situacao === "aprovado" && !i.incluidoContrato).map((i) => <option key={i.id} value={i.id}>Extra: {i.descricao}</option>)}</select>
                  <div className="grid grid-cols-2 gap-2"><Campo rotulo="Total a cobrar" nome="total"><input id="total" name="total" defaultValue={centavosParaInput(d.totalPrevistoCentavos)} className="input" /></Campo><Campo rotulo="Desconto" nome="desconto" dica={pode(ctx, "financeiro.desconto") ? undefined : "Exige autorização do gestor"}><input id="desconto" name="desconto" className="input" disabled={!pode(ctx, "financeiro.desconto")} /></Campo>
                    <Campo rotulo="Parcelas" nome="parcelas"><input id="parcelas" name="parcelas" type="number" min={1} max={24} defaultValue={1} className="input" /></Campo><Campo rotulo="1º vencimento" nome="vencimento"><input id="vencimento" name="vencimento" type="date" defaultValue={hojeSP()} className="input" required /></Campo></div>
                  <p className="hint">O total deve corresponder aos itens com preço; itens sem preço bloqueiam a geração (valor desconhecido não é gratuidade). A chave por OS impede duplicidade.</p>
                  <Enviar className="btn btn-primary btn-sm">Gerar cobrança</Enviar>
                </ActionForm>
              )}
            </Card></div>
          )}
          {pode(ctx, "autonomo.valores.ver", "empresa") && (
            <Card titulo="Remuneração de autônomos">
              {autonomos.length === 0 ? <p className="text-[13px] text-muted">Nenhum autônomo nesta OS. Equipe própria não gera pagamento por OS.</p> : (
                <ul className="space-y-3">{autonomos.map((a) => (
                  <li key={a.s.id} className="rounded-lg border border-line p-3 text-[13px]">
                    <div className="flex justify-between gap-2"><b>{a.profissionalNome}</b><Badge tom={a.situacaoExibida === "pago" ? "ok" : "info"}>{rotulo(AUTONOMO_SITUACAO, a.situacaoExibida)}</Badge></div>
                    <div className="text-muted">{a.s.descricao} · base: {a.s.base}{a.s.cobertoPorId ? " · coberto por acordo" : ""}</div>
                    <div>Valor combinado: <Dinheiro v={a.s.valorCombinadoCentavos} /></div>
                    {pode(ctx, "autonomo.valores.definir") && ["aguardando_valor", "aguardando_conferencia"].includes(a.s.situacao) && (
                      <div className="mt-2 space-y-2">
                        <ActionForm action={A.acaoAutonomo} className="flex flex-wrap gap-2">{H}<input type="hidden" name="servicoId" value={a.s.id} /><input name="valor" placeholder="Valor (R$)" defaultValue={centavosParaInput(a.s.valorCombinadoCentavos)} className="input !w-28" aria-label="Valor" /><input name="descricao" defaultValue={a.s.descricao} className="input !w-44" aria-label="Descrição" /><input name="motivo" placeholder="Motivo (se alterar)" className="input !w-36" aria-label="Motivo" /><Enviar className="btn btn-ghost btn-sm">Definir valor</Enviar></ActionForm>
                        <ActionForm action={A.acaoAutonomo} className="flex flex-wrap gap-2">{H}<input type="hidden" name="op" value="coberto" /><input type="hidden" name="servicoId" value={a.s.id} /><input name="motivo" placeholder="Acordo que já cobre (ex.: pacote mensal)" className="input !w-64" required /><Enviar className="btn btn-ghost btn-sm">Já coberto</Enviar></ActionForm>
                      </div>
                    )}
                  </li>
                ))}</ul>
              )}
              {pode(ctx, "autonomo.valores.definir") && autonomos.length > 0 && (
                <details className="mt-3"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Acordo adicional (visita, pacote ou retorno)</summary>
                  <ActionForm action={A.acaoAutonomo} className="mt-2 grid gap-2">{H}<input type="hidden" name="op" value="adicional" />
                    <select name="profissionalId" className="select">{[...new Map(autonomos.map((a) => [a.s.profissionalId, a.profissionalNome])).entries()].map(([pid, n]) => <option key={pid} value={pid}>{n}</option>)}</select>
                    <select name="base" className="select"><option value="visita">Por visita</option><option value="pacote">Pacote</option><option value="adicional_retorno">Adicional de retorno (sem receita ao cliente)</option></select>
                    <select name="visitaId" className="select"><option value="">(visita, se por visita)</option>{d.visitas.map((v) => <option key={v.id} value={v.id}>Visita {v.sequencia}</option>)}</select>
                    <input name="descricao" placeholder="Descrição" className="input" required /><input name="valor" placeholder="Valor (R$)" className="input" required /><input name="motivo" placeholder="Justificativa/autorização" className="input" required />
                    <Enviar className="btn btn-ghost btn-sm">Registrar acordo</Enviar>
                  </ActionForm>
                </details>
              )}
            </Card>
          )}
          <Card titulo="Relatório de atendimento (PDF)">
            {relatorios.length === 0 ? <p className="text-[13px] text-muted">Nenhum relatório emitido.</p> : (
              <ul className="space-y-3">{relatorios.map(({ r, emitidoPorNome }) => (
                <li key={r.id} className="rounded-lg border border-line p-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><b>{r.escopo === "visita" ? `Visita ${(r.conteudo as { visitaSequencia?: number }).visitaSequencia}` : "OS completa"} · v{r.versao}</b><a className="btn btn-ghost btn-sm" href={`/api/relatorios-atendimento/${r.id}/pdf`}><FileDown size={14} />PDF</a></div>
                  <div className="text-muted">Emitido por {emitidoPorNome} em {fmtDataHora(r.emitidoEm)} · ciência: {r.cienciaSituacao}{r.cienciaNome ? ` (${r.cienciaNome})` : ""}</div>
                  {r.cienciaSituacao === "pendente" && (
                    <ActionForm action={A.acaoCiencia} className="mt-2 grid gap-2 sm:grid-cols-[130px_1fr_1fr_auto]">{H}<input type="hidden" name="relatorioId" value={r.id} />
                      <select name="situacao" className="select" aria-label="Ciência"><option value="registrada">Ciente</option><option value="ausente">Responsável ausente</option><option value="recusada">Recusou-se</option></select>
                      <input name="nome" placeholder="Nome de quem acompanhou" className="input" /><input name="observacao" placeholder="Observações" className="input" /><Enviar className="btn btn-ghost btn-sm">Registrar</Enviar>
                    </ActionForm>
                  )}
                </li>
              ))}</ul>
            )}
            {pode(ctx, "os.conferir") && d.visitas.some((v) => v.situacao === "finalizada") && (
              <ActionForm action={A.acaoEmitirRelatorio} className="mt-3 space-y-2 border-t border-line pt-3">{H}
                <select name="visitaId" className="select" aria-label="Escopo"><option value="">OS completa (todas as visitas finalizadas)</option>{d.visitas.filter((v) => v.situacao === "finalizada").map((v) => <option key={v.id} value={v.id}>Somente visita {v.sequencia}</option>)}</select>
                {evid.length > 0 && <fieldset><legend className="label">Evidências a incluir</legend><div className="flex flex-wrap gap-2">{evid.map((a) => <label key={a.id} className="flex items-center gap-1 text-[12.5px]"><input type="checkbox" name="anexos" value={a.id} />{a.nomeArquivo}</label>)}</div></fieldset>}
                <p className="hint">Documento externo: inclui apenas cliente, local, equipamentos, datas, profissionais, serviço, resultado, pendências e fotos selecionadas. Nunca preços, custos, remuneração ou observações internas.</p>
                <Enviar className="btn btn-primary btn-sm">Emitir nova versão</Enviar>
              </ActionForm>
            )}
          </Card>
          <Card titulo="Documentos e fotos da OS"><ListaAnexos anexos={anexosOS} />{gerenciar && <div className="mt-3"><EnviarAnexo entidadeTipo="os" entidadeId={id} categoria="documento" rotulo="Anexar documento" /></div>}</Card>
          {hist.length > 0 && (
            <Card titulo="Histórico">
              <ul className="space-y-2 text-[12.5px]">{hist.map(({ a, nome }) => <li key={a.id}><span className="text-muted">{fmtDataHora(a.em)}</span> · <b>{nome ?? "Sistema"}</b> · {a.acao}{a.motivo ? ` — ${a.motivo}` : ""}</li>)}</ul>
            </Card>
          )}
          {!pode(ctx, "os.valores.ver") && <Aviso tom="info">Valores comerciais e custos não são exibidos para o seu perfil.</Aviso>}
        </div>
      </div>
    </div>
  );
}
