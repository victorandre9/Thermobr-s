import Link from "next/link";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterVeiculo } from "@/server/services/veiculos";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { fmtDataHora, fmtDia, hojeSP } from "@/lib/datas";
import { acaoVeiculoOp, acaoVeiculo } from "../actions";

export const metadata = { title: "Veículo" };
export default async function Veiculo({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); const { id } = await params;
  const d = await obterVeiculo(db, ctx, id); const v = d.veiculo;
  const ger = pode(ctx, "veiculo.gerenciar");
  const profs = ger ? (await listarProfissionais(db, ctx, { somenteAtivos: true })).filter((p) => p.vinculo === "proprio") : [];
  const H = <input type="hidden" name="veiculoId" value={id} />;
  return (
    <div className="space-y-5">
      <PageHeader titulo={v.identificacao} voltar={pode(ctx, "veiculo.ver", "empresa") ? { href: "/veiculos", rotulo: "Veículos" } : undefined} subtitulo={[v.modelo, v.placa, v.demo && "demonstração"].filter(Boolean).join(" · ")}
        acoes={d.podeChecklist && <Link href={`/veiculos/${id}/checklist`} className="btn btn-primary">Fazer checklist</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Situação">
          <Dl itens={[["Odômetro", v.odometroKm !== null ? `${v.odometroKm.toLocaleString("pt-BR")} km` : "Não informado"], ["Atualizado em", v.odometroAtualizadoEm ? fmtDataHora(v.odometroAtualizadoEm) : "—"], ["Designado a", d.designados.map((x) => x.nome).join(", ") || "—"],
            ["Parâmetros", Object.entries(v.parametrosManutencao).map(([k, p]) => `${k}: ${p.km ? p.km + " km" : ""}${p.km && p.dias ? " / " : ""}${p.dias ? p.dias + " dias" : ""}`).join("; ") || "Não definidos"]]} />
          <ul className="mt-3 space-y-1 text-[13px]">{d.alertas.map((a) => <li key={a.tipo}><Badge tom={a.status === "vencido" ? "critico" : a.status === "proximo" ? "atencao" : a.status === "ok" ? "ok" : "neutro"}>{a.tipo}</Badge> {a.motivo}{a.limitacao && <span className="text-warn"> · {a.limitacao}</span>}</li>)}</ul>
        </Card>
        <Card titulo="Irregularidades e tratativas">
          {d.pendencias.length === 0 ? <p className="text-[13px] text-muted">Nenhuma.</p> : <ul className="space-y-2 text-[13px]">{d.pendencias.map(({ p, responsavelNome }) => <li key={p.id}><Link href={`/pendencias/${p.id}`} className="font-semibold text-navy hover:underline">{p.titulo}</Link> <Badge tom={["aberta", "em_andamento"].includes(p.situacao) ? (p.prioridade === "critica" ? "critico" : "atencao") : "ok"}>{p.situacao}</Badge><div className="text-muted">Resp.: {responsavelNome ?? "—"} · prazo {p.prazo ? fmtDia(p.prazo) : "—"}{p.resolucao && ` · ${p.resolucao}`}</div></li>)}</ul>}
          <p className="hint mt-2">O checklist registra a condição observada; não determina a causa de desgaste.</p>
        </Card>
      </div>
      <Card titulo="Checklists" pad={false}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Quando</th><th>Tipo</th><th>Por</th><th>KM</th><th>Irregulares</th><th>Válido até</th></tr></thead>
          <tbody>{d.checklists.map(({ r, nome, irregulares }) => <tr key={r.id}><td>{fmtDataHora(r.realizadoEm)}</td><td>{r.tipo === "veiculo_saida" ? "Saída" : "Retorno"} · modelo v{r.modeloVersao}</td><td>{nome}</td><td>{r.km?.toLocaleString("pt-BR") ?? "—"}</td><td>{irregulares ? <Badge tom="critico">{irregulares}</Badge> : "0"}</td><td>{fmtDataHora(r.validoAte)}</td></tr>)}</tbody></table></div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Pneus">
          <ul className="space-y-2 text-[13px]">{d.pneus.map((p) => <li key={p.id}><b>{p.identificacao}</b> · {p.posicao} · {p.situacao} · desde {p.instaladoEm ? fmtDia(p.instaladoEm) : "—"} ({p.kmInstalacao ?? "?"} km)
            <div className="text-muted">Duração: {p.duracao.dias !== null ? `${p.duracao.dias} dias` : "sem data"} · {p.duracao.km !== null ? `${p.duracao.km.toLocaleString("pt-BR")} km` : "km indisponível"}{p.motivoRetirada && ` · retirado: ${p.motivoRetirada}`}</div>
            {ger && p.situacao === "instalado" && <ActionForm action={acaoVeiculoOp} className="mt-1 flex flex-wrap gap-1">{H}<input type="hidden" name="op" value="retirarPneu" /><input type="hidden" name="pneuId" value={p.id} /><input type="date" name="data" defaultValue={hojeSP()} className="input !w-36" /><input name="km" placeholder="KM" className="input !w-24" /><input name="motivo" placeholder="Motivo" className="input !w-40" required /><Enviar className="btn btn-ghost btn-sm">Retirar</Enviar></ActionForm>}</li>)}</ul>
          {ger && <ActionForm action={acaoVeiculoOp} className="mt-3 grid gap-2 sm:grid-cols-3" resetar>{H}<input type="hidden" name="op" value="pneu" /><input name="identificacao" placeholder="Identificação do pneu" className="input" required /><select name="posicao" className="select">{["DE", "DD", "TE", "TD", "estepe"].map((x) => <option key={x}>{x}</option>)}</select><input type="date" name="data" defaultValue={hojeSP()} className="input" /><input name="km" placeholder="KM na instalação" className="input" /><input name="marca" placeholder="Marca" className="input" /><Enviar className="btn btn-ghost">Instalar pneu</Enviar></ActionForm>}
        </Card>
        <Card titulo="Manutenções">
          <ul className="space-y-1 text-[13px]">{d.manutencoes.map((m) => <li key={m.id}>{fmtDia(m.data)} · <b>{m.tipo}</b> · {m.km?.toLocaleString("pt-BR") ?? "—"} km {m.descricao && `· ${m.descricao}`}</li>)}</ul>
          {ger && <ActionForm action={acaoVeiculoOp} className="mt-3 grid gap-2 sm:grid-cols-3" resetar>{H}<input type="hidden" name="op" value="manutencao" /><select name="tipo" className="select">{["oleo", "alinhamento", "rodizio", "pneu", "revisao", "outro"].map((x) => <option key={x}>{x}</option>)}</select><input type="date" name="data" defaultValue={hojeSP()} className="input" /><input name="km" placeholder="KM" className="input" /><input name="descricao" placeholder="Descrição" className="input sm:col-span-3" />
            {pode(ctx, "financeiro.lancar") || ger ? <><input name="valor" placeholder="Valor (gera conta a pagar)" className="input" /><input type="date" name="vencimento" className="input" aria-label="Vencimento" /></> : null}<Enviar className="btn btn-ghost">Registrar</Enviar></ActionForm>}
        </Card>
      </div>
      {(ger || d.podeChecklist) && (
        <Card titulo="Odômetro">
          <ActionForm action={acaoVeiculoOp} className="flex flex-wrap gap-2" resetar>{H}<input type="hidden" name="op" value="odometro" /><input name="km" inputMode="numeric" placeholder="KM atual" className="input !w-40" required />{pode(ctx, "veiculo.odometro.corrigir") && <input name="motivo" placeholder="Motivo (só para correção/redução)" className="input !w-72" />}<Enviar className="btn btn-ghost">Registrar KM</Enviar></ActionForm>
          <ul className="mt-3 space-y-1 text-[12.5px] text-muted">{d.odometros.slice(0, 8).map(({ o, nome }) => <li key={o.id}>{fmtDataHora(o.em)} · {o.km.toLocaleString("pt-BR")} km · {o.fonte}{o.correcao && ` (correção: ${o.motivo})`} · {nome}</li>)}</ul>
        </Card>
      )}
      {ger && (
        <Card titulo="Designação e cadastro">
          <ActionForm action={acaoVeiculoOp} className="mb-4 flex flex-wrap gap-2">{H}<input type="hidden" name="op" value="designar" /><select name="profissionalId" className="select !w-64" required><option value="">Técnico da equipe própria…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><Enviar className="btn btn-ghost">Designar este veículo</Enviar></ActionForm>
          <ActionForm action={acaoVeiculo} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="versao" value={v.versao} />
            <input name="identificacao" defaultValue={v.identificacao} className="input" /><input name="placa" defaultValue={v.placa ?? ""} placeholder="Placa" className="input" /><input name="modelo" defaultValue={v.modelo ?? ""} placeholder="Modelo" className="input" /><input name="ano" defaultValue={v.ano ?? ""} placeholder="Ano" className="input" />
            {(["oleo", "alinhamento", "rodizio"] as const).map((t) => <div key={t} className="grid grid-cols-2 gap-1"><input name={`${t}_km`} defaultValue={v.parametrosManutencao[t]?.km ?? ""} placeholder={`${t} km`} className="input" /><input name={`${t}_dias`} defaultValue={v.parametrosManutencao[t]?.dias ?? ""} placeholder="dias" className="input" /></div>)}
            <input type="hidden" name="responsavelId" value={v.responsavelProfissionalId ?? ""} /><Enviar>Salvar</Enviar></ActionForm>
        </Card>
      )}
    </div>
  );
}
