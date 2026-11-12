import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarDivergencias, listarRetalhos, saldosPorPosicao } from "@/server/services/materiais";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader, Qtd, Vazio } from "@/components/ui";
import { MateriaisNav } from "@/components/materiais-nav";
import { fmtDataHora } from "@/lib/datas";
import { acaoMovMaterial } from "../actions";

export const metadata = { title: "Divergências de material" };
export default async function Divergencias() {
  const ctx = await exigirCtx();
  const [divs, ret, seg] = await Promise.all([listarDivergencias(db, ctx), listarRetalhos(db, ctx), saldosPorPosicao(db, ctx).then((s) => s.filter((x) => x.posicaoTipo === "segregado"))]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Divergências, segregados e retalhos" />
      <MateriaisNav ativo="/materiais/divergencias" />
      <Aviso tom="info">Diferença é algo a investigar — nunca acusação automática. Perdas e ajustes exigem justificativa e aprovação do gestor; ninguém aprova a própria diferença.</Aviso>
      <Card titulo={`Divergências abertas (${divs.length})`} pad={false}>
        {divs.length === 0 ? <Vazio titulo="Nenhuma divergência aberta" /> : <ul className="divide-y divide-white">{divs.map(({ d, materialNome, unidade, profissionalNome, osNumero }) => (
          <li key={d.id} className="p-4 text-[13.5px]"><div className="flex flex-wrap gap-2"><Badge tom="atencao">{d.tipo}</Badge><b><Qtd v={d.quantidade} u={unidade} /> de {materialNome}</b>{profissionalNome && <span className="text-muted">· custódia: {profissionalNome}</span>}{osNumero && <span className="text-muted">· OS {osNumero}</span>}</div>
            <p className="mt-1 text-text-2">{d.descricao}</p><p className="text-[12px] text-muted">Aberta em {fmtDataHora(d.abertaEm)}</p>
            {pode(ctx, "divergencia.aprovar") && <ActionForm action={acaoMovMaterial} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="op" value="divergencia" /><input type="hidden" name="divergenciaId" value={d.id} />
              <select name="decisao" className="select !w-60" aria-label="Decisão"><option value="mantida_custodia">Manter em custódia (autorizado)</option><option value="localizada">Localizado / devolução registrada</option><option value="perda_aprovada">Aprovar perda (baixa explícita)</option><option value="ajuste_aprovado">Aprovar ajuste (sobra de inventário)</option><option value="resolvida">Resolvida sem movimento</option></select>
              <input name="justificativa" placeholder="Justificativa" className="input !w-64" required /><Enviar className="btn btn-primary btn-sm">Decidir</Enviar></ActionForm>}
          </li>))}</ul>}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Peças segregadas (aguardando conferência)">
          {seg.length === 0 ? <p className="text-[13px] text-muted">Nenhuma.</p> : <ul className="space-y-3">{seg.map((s) => (
            <li key={s.materialId} className="text-[13.5px]"><b>{s.materialNome}</b> — <Qtd v={s.quantidade} u={s.unidade} /> (não conta como estoque disponível nem consumo)
              {pode(ctx, "material.conferir") && <ActionForm action={acaoMovMaterial} className="mt-1 flex flex-wrap gap-2"><input type="hidden" name="op" value="segregado" /><input type="hidden" name="materialId" value={s.materialId} /><input name="quantidade" defaultValue={s.quantidade} className="input !w-24" /><select name="destino" className="select !w-48"><option value="almoxarifado">Liberar ao estoque</option><option value="fornecedor">Devolver ao fornecedor</option></select><input name="observacao" placeholder="Resultado" className="input !w-48" required /><Enviar className="btn btn-ghost btn-sm">Aplicar</Enviar></ActionForm>}</li>))}</ul>}
        </Card>
        <Card titulo="Retalhos disponíveis">
          {ret.length === 0 ? <p className="text-[13px] text-muted">Nenhum retalho registrado.</p> : <ul className="space-y-1 text-[13.5px]">{ret.map(({ r, materialNome, especificacao, unidade, posicaoNome }) => <li key={r.id}>{materialNome} {especificacao} — <b><Qtd v={r.comprimento} u={unidade} /></b> · {posicaoNome}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
