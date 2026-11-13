import { Voltar } from "@/components/voltar";
import Link from "next/link";
import { MapPin, Phone, Users, ClipboardCheck, PlayCircle, Flag, PackagePlus, MessageSquareWarning } from "lucide-react";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterVisitaTecnico } from "@/server/services/execucao";
import { prontidaoVisita } from "@/server/services/prontidao";
import { minhaCustodia } from "@/server/services/materiais";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, Campo, Qtd } from "@/components/ui";
import { SituacaoVisita } from "@/components/status";
import { EnviarAnexo, ListaAnexos } from "@/components/anexos";
import { MOTIVOS_RESULTADO, TESTE_FUNCIONAMENTO, VISITA_RESULTADOS, rotulo } from "@/lib/dominio";
import { fmtDataHora, fmtHora } from "@/lib/datas";
import * as A from "../actions";

export const metadata = { title: "Visita" };

export default async function Visita({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx();
  const { id } = await params;
  const d = await obterVisitaTecnico(db, ctx, id);
  const [pr, cust] = await Promise.all([prontidaoVisita(db, ctx, id), ctx.profissional ? minhaCustodia(db, ctx) : Promise.resolve(null)]);
  const v = d.visita;
  const minhaPart = d.participacoes.find((p) => p.profissionalId === ctx.profissional?.id);
  const H = <input type="hidden" name="visitaId" value={id} />;
  const endereco = d.local ? [d.local.logradouro, d.local.numero, d.local.complemento, d.local.bairro, d.local.cidade].filter(Boolean).join(", ") : null;
  const fotosVisita = d.fotos.filter((f) => f.entidadeTipo === "visita");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Voltar href={pode(ctx, "os.ver", "empresa") ? `/os/${d.os.id}` : "/"} rotulo={pode(ctx, "os.ver", "empresa") ? `OS #${d.os.numero}` : "Minhas visitas"} />
        <h1 className="mt-1 text-[22px] font-bold text-navy">{d.cliente.nome}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-2">OS #{d.os.numero} · visita {v.sequencia} <SituacaoVisita s={v.situacao} r={v.resultado} />{["agendada", "nao_agendada"].includes(v.situacao) && <Badge tom={pr.pronta ? "ok" : "critico"}>{pr.situacao}</Badge>}</div>
      </div>

      <Card>
        <div className="space-y-2 text-[14px]">
          <div className="flex gap-2"><MapPin size={18} className="mt-0.5 shrink-0 text-ice-strong" /><span>{endereco ?? <b className="text-warn">Endereço não informado</b>}{d.local?.instrucoesAcesso && <span className="block text-[13px] text-muted">Acesso: {d.local.instrucoesAcesso}</span>}</span></div>
          <div className="flex gap-2"><Phone size={18} className="mt-0.5 shrink-0 text-ice-strong" />{d.contato ? `${d.contato.nome} · ${d.contato.telefone ?? "sem telefone"}` : d.cliente.telefone ?? "Sem contato"}</div>
          <div className="flex gap-2"><Users size={18} className="mt-0.5 shrink-0 text-ice-strong" />{d.equipe.map((e) => `${e.nome}${e.papel === "responsavel" ? " (responsável)" : ""}`).join(", ")}</div>
          <div className="text-[13px] text-muted">Previsto: {v.inicioPrevisto ? `${fmtDataHora(v.inicioPrevisto)} – ${fmtHora(v.fimPrevisto)}` : "sem data"}{v.checkinEm && ` · Início real ${fmtHora(v.checkinEm)}`}{v.checkoutEm && ` · Fim ${fmtHora(v.checkoutEm)}`}</div>
          <p className="rounded-2xl bg-white/60 p-3 text-[14px]"><b>Serviço:</b> {d.os.descricao}{v.instrucoes && <><br /><b>Instruções:</b> {v.instrucoes}</>}</p>
          {d.equipamentos.length > 0 && <div className="text-[13.5px]"><b>Equipamentos:</b> {d.equipamentos.map((e) => [e.identificacao, e.tipo, e.marca, e.modelo].filter(Boolean).join(" · ")).join("; ")}</div>}
          {d.itens.length > 0 && <ul className="text-[13px] text-text-2">{d.itens.map((i) => <li key={i.id}>• {i.descricao} — <Qtd v={i.quantidade} u={i.unidade} />{i.situacao === "extra_solicitado" && " (extra aguardando aprovação)"}</li>)}</ul>}
        </div>
      </Card>

      {["agendada", "nao_agendada"].includes(v.situacao) && <Card titulo={`Conferência antes da saída — ${pr.situacao}`} icone={ClipboardCheck}>
        <ul className="space-y-2">{pr.itens.map((i) => (
          <li key={i.codigo} className="flex gap-2 text-[13px]">
            <Badge tom={i.status === "ok" ? "ok" : i.status === "impeditivo" ? "critico" : i.status === "alerta" ? "atencao" : "neutro"}>{i.status === "ok" ? "OK" : i.status === "impeditivo" ? "Impede" : i.status === "alerta" ? "Alerta" : "N/A"}</Badge>
            <span><b>{i.rotulo}:</b> {i.detalhe}{i.proximaAcao && <span className="text-muted"> → {i.proximaAcao} ({i.responsavel})</span>}</span>
          </li>
        ))}</ul>
        {ctx.profissional?.vinculo === "proprio" && ctx.profissional.veiculoId && pr.itens.some((i) => i.codigo === `veiculo:${ctx.profissional!.id}` && i.status !== "ok") && <Link className="btn btn-ghost mt-3" href={`/veiculos/${ctx.profissional.veiculoId}/checklist`}>Fazer checklist do veículo</Link>}
      </Card>}

      {v.situacao === "agendada" && (
        d.podeConduzir
          ? <ActionForm action={A.acaoCheckin}>{H}<Enviar className="btn btn-ok btn-lg w-full" pendente="Registrando…"><PlayCircle size={20} />Iniciar atendimento (check-in)</Enviar><p className="hint mt-1 text-center">Horário registrado pelo servidor. Toques repetidos não duplicam.</p></ActionForm>
          : <Aviso tom="info">O responsável pela visita inicia o atendimento. Registre sua chegada quando estiver no local.</Aviso>
      )}
      {ctx.profissional && d.equipe.some((e) => e.id === ctx.profissional!.id) && !d.podeConduzir && ["agendada", "em_atendimento", "finalizada"].includes(v.situacao) && (
        <Card titulo="Minha participação">
          <p className="mb-2 text-[13px] text-muted">Chegada: {minhaPart?.chegadaEm ? fmtHora(minhaPart.chegadaEm) : "—"} · Saída: {minhaPart?.saidaEm ? fmtHora(minhaPart.saidaEm) : "—"}. O tempo de cada integrante é registrado individualmente.</p>
          <div className="flex gap-2">
            {!minhaPart?.chegadaEm && <ActionForm action={A.acaoParticipacao}>{H}<input type="hidden" name="tipo" value="chegada" /><Enviar className="btn btn-ice">Registrar chegada</Enviar></ActionForm>}
            {minhaPart?.chegadaEm && !minhaPart.saidaEm && <ActionForm action={A.acaoParticipacao}>{H}<input type="hidden" name="tipo" value="saida" /><Enviar className="btn btn-ghost">Registrar saída</Enviar></ActionForm>}
          </div>
        </Card>
      )}

      {v.situacao === "em_atendimento" && (
        <>
          {(d.equipamentos.length ? d.equipamentos : [null]).map((e) => {
            const ex = d.execucoes.find((x) => x.equipamentoId === (e?.id ?? null));
            const fotos = ex ? d.fotos.filter((f) => f.entidadeTipo === "visita_execucao" && f.entidadeId === ex.id) : [];
            return (
              <Card key={e?.id ?? "geral"} titulo={e ? `Ficha — ${[e.identificacao, e.tipo, e.marca].filter(Boolean).join(" · ")}` : "Ficha de execução"}>
                <ActionForm action={A.acaoExecucao} className="space-y-3">{H}<input type="hidden" name="equipamentoId" value={e?.id ?? ""} />
                  <Campo rotulo="Diagnóstico" nome={`diag-${e?.id}`}><textarea id={`diag-${e?.id}`} name="diagnostico" rows={2} defaultValue={ex?.diagnostico ?? ""} className="textarea" /></Campo>
                  <Campo rotulo="Serviço realizado" nome={`serv-${e?.id}`}><textarea id={`serv-${e?.id}`} name="servicoRealizado" rows={2} defaultValue={ex?.servicoRealizado ?? ""} className="textarea" /></Campo>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="Teste de funcionamento" nome={`t-${e?.id}`}><select id={`t-${e?.id}`} name="teste" defaultValue={ex?.testeFuncionamento ?? "nao_testado"} className="select">{Object.entries(TESTE_FUNCIONAMENTO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                    <Campo rotulo="Resultado neste equipamento" nome={`r-${e?.id}`}><select id={`r-${e?.id}`} name="resultado" defaultValue={ex?.resultado ?? ""} className="select"><option value="">—</option><option value="concluido">Concluído</option><option value="parcial">Parcial</option><option value="nao_realizado">Não realizado</option></select></Campo>
                  </div>
                  <Campo rotulo="Observações" nome={`o-${e?.id}`}><input id={`o-${e?.id}`} name="observacoes" defaultValue={ex?.observacoes ?? ""} className="input" /></Campo>
                  <Enviar className="btn btn-primary w-full">Salvar ficha</Enviar>
                </ActionForm>
                {ex && <div className="mt-3 border-t border-white pt-3"><ListaAnexos anexos={fotos} /><div className="mt-2"><EnviarAnexo entidadeTipo="visita_execucao" entidadeId={ex.id} rotulo="Foto deste equipamento" /></div></div>}
              </Card>
            );
          })}
          <Card titulo="Fotos gerais da visita"><ListaAnexos anexos={fotosVisita} /><div className="mt-2"><EnviarAnexo entidadeTipo="visita" entidadeId={id} /></div></Card>

          {cust && (
            <Card titulo="Material utilizado / sobra" icone={PackagePlus}>
              {cust.saldos.length === 0 ? <p className="text-[13px] text-muted">Nenhum material sob sua custódia.</p> : (
                <ActionForm action={A.acaoInformarMaterial} className="grid gap-2 sm:grid-cols-2" resetar>{H}<input type="hidden" name="osId" value={d.os.id} />
                  <select name="tipo" className="select" aria-label="Tipo"><option value="consumo">Consumi no serviço</option><option value="devolucao">Sobra a devolver</option><option value="perda">Perda / dano</option><option value="segregacao">Peça divergente/danificada</option></select>
                  <select name="materialId" className="select" aria-label="Material">{cust.saldos.map((m) => <option key={m.materialId} value={m.materialId}>{m.nome} {m.especificacao ?? ""} (comigo: {Number(m.quantidade)} {m.unidade})</option>)}</select>
                  <input name="quantidade" inputMode="decimal" placeholder="Quantidade" className="input" required aria-label="Quantidade" />
                  <input name="observacao" placeholder="Observação (obrigatória para perda)" className="input" aria-label="Observação" />
                  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="retalho" />Sobra é retalho (preservar comprimento)</label>
                  <Enviar className="btn btn-ghost">Informar</Enviar>
                </ActionForm>
              )}
              <p className="hint mt-2">Informações aguardam conferência. Sobra só volta ao estoque após conferida. Material levado para várias OS não é consumido inteiro na primeira visita.</p>
            </Card>
          )}

          <Card titulo="Solicitar ao escritório" icone={MessageSquareWarning}>
            <ActionForm action={A.acaoSolicitacao} className="grid gap-2" resetar>{H}
              <select name="tipo" className="select" aria-label="Tipo"><option value="extra">Serviço/peça extra (aprovação)</option><option value="material">Necessidade de material</option><option value="retorno">Retorno necessário</option><option value="remarcacao">Remarcação</option></select>
              <input name="descricao" placeholder="Descreva" className="input" required aria-label="Descrição" />
              <div className="grid grid-cols-3 gap-2"><select name="itemTipo" className="select" aria-label="Tipo de item"><option value="servico">Serviço</option><option value="peca">Peça</option></select><input name="quantidade" defaultValue="1" className="input" aria-label="Qtd" /><select name="unidade" className="select" aria-label="Unidade"><option>un</option><option>m</option><option>kg</option></select></div>
              <input name="justificativa" placeholder="Justificativa" className="input" aria-label="Justificativa" />
              <Enviar className="btn btn-ghost">Enviar solicitação</Enviar>
            </ActionForm>
            <p className="hint mt-1">Você não altera preços nem cria cobrança: o escritório aprova e decide a agenda.</p>
          </Card>

          {d.podeConduzir && (
            <Card titulo="Encerrar atendimento (check-out)" icone={Flag}>
              <ActionForm action={A.acaoCheckout} className="space-y-3" confirmar="Encerrar o atendimento agora?">{H}
                <Campo rotulo="Resultado" nome="resultado" obrigatorio><select id="resultado" name="resultado" className="select" required>{Object.entries(VISITA_RESULTADOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                <Campo rotulo="Motivo (se parcial ou não realizada)" nome="motivo"><select id="motivo" name="motivo" className="select"><option value="">—</option>{Object.entries(MOTIVOS_RESULTADO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                <Campo rotulo="O que foi feito e o que ficou pendente" nome="pendencia"><textarea id="pendencia" name="pendencia" rows={2} className="textarea" /></Campo>
                <Campo rotulo="Próxima ação sugerida" nome="proximaAcao"><input id="proximaAcao" name="proximaAcao" className="input" /></Campo>
                <Campo rotulo="Destino dos materiais" nome="destinoMateriais"><input id="destinoMateriais" name="destinoMateriais" placeholder="Ex.: sobra de cobre permanece no veículo" className="input" /></Campo>
                <Campo rotulo="Comentário" nome="comentario"><input id="comentario" name="comentario" className="input" /></Campo>
                <p className="hint">Concluída exige ficha de todos os equipamentos, teste OK e ao menos uma foto. Parcial/não realizada não exige foto de equipamento funcionando.</p>
                <Enviar className="btn btn-primary btn-lg w-full" pendente="Encerrando…">Encerrar atendimento</Enviar>
              </ActionForm>
            </Card>
          )}
        </>
      )}

      {v.situacao === "finalizada" && (
        <Card titulo="Resultado">
          <p className="text-[14px]"><b>{rotulo(VISITA_RESULTADOS, v.resultado)}</b>{v.motivoResultado && ` — ${rotulo(MOTIVOS_RESULTADO, v.motivoResultado)}`}</p>
          {v.pendenciaDescricao && <p className="mt-1 text-[13.5px]">{v.pendenciaDescricao} → {v.proximaAcao}</p>}
          <ul className="mt-2 space-y-1 text-[13px]">{d.execucoes.map((e) => <li key={e.id}>• {e.servicoRealizado ?? "—"} ({rotulo(TESTE_FUNCIONAMENTO, e.testeFuncionamento)})</li>)}</ul>
          <div className="mt-3"><ListaAnexos anexos={d.fotos} /></div>
        </Card>
      )}
      {d.historico.length > 0 && (
        <Card titulo="Outras visitas desta OS"><ul className="space-y-1 text-[13px]">{d.historico.map((h) => <li key={h.id}>Visita {h.sequencia}: <SituacaoVisita s={h.situacao} r={h.resultado} /> {h.pendencia && `— ${h.pendencia}`}</li>)}</ul></Card>
      )}
    </div>
  );
}
