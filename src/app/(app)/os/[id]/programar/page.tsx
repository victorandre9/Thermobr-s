import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { recomendarTecnicos } from "@/server/services/recomendacao";
import { listarVagas } from "@/server/services/agenda";
import { obterOS } from "@/server/services/os";
import { ferramenta, veiculo } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Campo, PageHeader } from "@/components/ui";
import { hojeSP, instanteSP, somarDias, diaSP, fmtHora } from "@/lib/datas";
import { acaoAgendar } from "../../actions";

export const metadata = { title: "Programar visita" };

export default async function Programar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); exigir(ctx, "agenda.gerenciar");
  const { id } = await params; const sp = await searchParams;
  const d = await obterOS(db, ctx, id);
  const v = d.visitas.find((x) => x.id === sp.visitaId) ?? d.visitas.find((x) => x.situacao === "nao_agendada");
  if (!v) return <div><PageHeader titulo="Programar visita" voltar={{ href: `/os/${id}`, rotulo: `OS #${d.os.numero}` }} /><Aviso tom="atencao">Crie uma visita na OS antes de programar.</Aviso></div>;
  const vagas = await listarVagas(db, ctx);
  const dia = sp.dia ?? (v.inicioPrevisto ? diaSP(v.inicioPrevisto) : somarDias(hojeSP(), 1));
  const hi = sp.hi ?? (v.inicioPrevisto ? fmtHora(v.inicioPrevisto) : vagas[0]?.horaInicio.slice(0, 5) ?? "08:00");
  const hf = sp.hf ?? (v.fimPrevisto ? fmtHora(v.fimPrevisto) : vagas[0]?.horaFim.slice(0, 5) ?? "12:00");
  const veiculos = await db.select().from(veiculo).where(and(eq(veiculo.empresaId, ctx.empresaId), eq(veiculo.ativo, true)));
  const exclusivas = await db.select().from(ferramenta).where(and(eq(ferramenta.empresaId, ctx.empresaId), eq(ferramenta.exclusiva, true), eq(ferramenta.ativo, true)));
  const rec = await recomendarTecnicos(db, ctx, id, instanteSP(dia, hi), instanteSP(dia, hf), { veiculoId: sp.veiculoId || null, ferramentaIds: sp.ferramentas ? sp.ferramentas.split(",") : [], visitaId: v.id });
  const atuais = new Set(v.participantes.map((p) => p.profissionalId));
  const sugeridos = new Set(atuais.size ? [...atuais] : rec.candidatos.filter((c) => c.elegivel).slice(0, rec.qtdNecessaria).map((c) => c.profissionalId));
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader titulo={`Programar visita ${v.sequencia} — OS #${d.os.numero}`} voltar={{ href: `/os/${id}`, rotulo: `OS #${d.os.numero}` }} subtitulo={`${d.cliente.nome} · ${d.os.descricao.slice(0, 90)}`} />
      <Card titulo="1. Intervalo e recursos (para verificar disponibilidade)">
        <form className="grid gap-3 sm:grid-cols-[1fr_120px_120px_1fr_auto] sm:items-end" action={`/os/${id}/programar`}>
          <input type="hidden" name="visitaId" value={v.id} />
          <Campo rotulo="Dia" nome="dia"><input id="dia" type="date" name="dia" defaultValue={dia} className="input" /></Campo>
          <Campo rotulo="Início" nome="hi"><input id="hi" type="time" name="hi" defaultValue={hi} className="input" /></Campo>
          <Campo rotulo="Fim" nome="hf"><input id="hf" type="time" name="hf" defaultValue={hf} className="input" /></Campo>
          <Campo rotulo="Veículo (recurso exclusivo)" nome="veiculoId"><select id="veiculoId" name="veiculoId" defaultValue={sp.veiculoId ?? ""} className="select"><option value="">—</option>{veiculos.map((x) => <option key={x.id} value={x.id}>{x.identificacao}</option>)}</select></Campo>
          <button className="btn btn-ghost">Verificar</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{vagas.map((g) => <Link key={g.id} className="chip" href={`/os/${id}/programar?visitaId=${v.id}&dia=${dia}&hi=${g.horaInicio.slice(0, 5)}&hf=${g.horaFim.slice(0, 5)}`}>{g.nome} {g.horaInicio.slice(0, 5)}–{g.horaFim.slice(0, 5)}</Link>)}
          {vagas.length >= 2 && <Link className="chip" href={`/os/${id}/programar?visitaId=${v.id}&dia=${dia}&hi=${vagas[0].horaInicio.slice(0, 5)}&hf=${vagas[vagas.length - 1].horaFim.slice(0, 5)}`}>Dia inteiro (várias vagas)</Link>}</div>
      </Card>
      <Card titulo="2. Técnicos indicados">
        <div className="mb-3 space-y-2">
          {rec.avisos.map((a) => <Aviso key={a} tom="atencao">{a}</Aviso>)}
          {rec.conflitosRecurso.map((a) => <Aviso key={a} tom="critico">{a}</Aviso>)}
          <p className="text-[12.5px] text-muted">{rec.observacao}</p>
        </div>
        <ActionForm action={acaoAgendar} className="space-y-3">
          <input type="hidden" name="osId" value={id} /><input type="hidden" name="visitaId" value={v.id} /><input type="hidden" name="dia" value={dia} /><input type="hidden" name="horaInicio" value={hi} /><input type="hidden" name="horaFim" value={hf} />
          {sp.veiculoId && <input type="hidden" name="veiculoId" value={sp.veiculoId} />}
          <ul className="space-y-2">{rec.candidatos.map((c, i) => (
            <li key={c.profissionalId} className={`rounded-2xl border p-3 ${c.elegivel ? "border-white bg-white/60" : "border-line bg-surface-2/60 opacity-80"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-semibold text-navy"><input type="checkbox" name="profissionais" value={c.profissionalId} defaultChecked={sugeridos.has(c.profissionalId)} />{c.nome}</label>
                <Badge tom="neutro" icone={false}>{c.vinculo === "autonomo" ? "Autônomo" : "Equipe própria"}</Badge>
                {c.elegivel ? <Badge tom="ok">{i < rec.qtdNecessaria ? "Indicado" : "Elegível"}</Badge> : <Badge tom="critico">Não elegível</Badge>}
                <label className="ml-auto flex items-center gap-1 text-[12.5px]"><input type="radio" name="responsavelId" value={c.profissionalId} defaultChecked={i === 0 && c.elegivel} />responsável</label>
              </div>
              <ul className="mt-1 text-[12.5px]">
                {c.impedimentos.map((x) => <li key={x} className="text-bad">✕ {x}</li>)}
                {c.motivos.map((x) => <li key={x} className="text-text-2">✓ {x}</li>)}
                {c.limitacoes.map((x) => <li key={x} className="text-warn">⚠ Dado faltante: {x}</li>)}
              </ul>
            </li>
          ))}</ul>
          {exclusivas.length > 0 && <fieldset><legend className="label">Ferramentas exclusivas a reservar</legend><div className="flex flex-wrap gap-3">{exclusivas.map((f) => <label key={f.id} className="flex items-center gap-1 text-[13px]"><input type="checkbox" name="ferramentas" value={f.id} />{f.nome}</label>)}</div></fieldset>}
          {v.situacao === "agendada" && <Campo rotulo="Motivo do reagendamento" nome="motivo" obrigatorio><input id="motivo" name="motivo" className="input" required /></Campo>}
          <p className="hint">A escolha é sua: a indicação não agenda sozinha. Profissionais não elegíveis só serão aceitos se não houver conflito; sobreposição é bloqueada no servidor.</p>
          <Enviar className="btn btn-primary btn-lg">Confirmar agendamento</Enviar>
        </ActionForm>
      </Card>
    </div>
  );
}
