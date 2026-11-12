import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { minhaCustodia, listarPosicoes } from "@/server/services/materiais";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader, Qtd, Vazio } from "@/components/ui";
import { MATERIAL_MOV_STATUS, MATERIAL_MOV_TIPOS, rotulo } from "@/lib/dominio";
import { fmtDataHora } from "@/lib/datas";
import { acaoMovMaterial } from "../actions";

export const metadata = { title: "Minha custódia" };
export default async function MinhaCustodia() {
  const ctx = await exigirCtx();
  const c = await minhaCustodia(db, ctx);
  const pos = c.posicao ? (await listarPosicoes(db, ctx)).filter((p) => p.id !== c.posicao!.id && ["profissional", "veiculo", "almoxarifado"].includes(p.tipo)) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader titulo="Materiais sob minha custódia" subtitulo="Confirme o que recebeu e informe o que usou ou sobrou. O escritório confere." />
      {c.pendentes.length > 0 && <Card titulo={`Confirmar recebimento (${c.pendentes.length})`}><ul className="space-y-3">{c.pendentes.map(({ mov, materialNome, origemNome }) => (
        <li key={mov.id} className="text-[14px]"><b>{materialNome}</b> — <Qtd v={mov.quantidade} u={mov.unidade} /> de {origemNome}
          <div className="mt-2 flex flex-wrap gap-2"><ActionForm action={acaoMovMaterial}><input type="hidden" name="op" value="confirmar" /><input type="hidden" name="movimentoId" value={mov.id} /><Enviar className="btn btn-ok">Recebi</Enviar></ActionForm>
            <ActionForm action={acaoMovMaterial} className="flex gap-1"><input type="hidden" name="op" value="recusar" /><input type="hidden" name="movimentoId" value={mov.id} /><input name="motivo" placeholder="Motivo" className="input !w-40" required /><Enviar className="btn btn-danger">Não recebi / divergente</Enviar></ActionForm></div></li>))}</ul></Card>}
      <Card titulo="Comigo agora" pad={false}>
        {c.saldos.length === 0 ? <Vazio titulo="Nenhum material sob sua custódia" /> : <ul className="divide-y divide-white">{c.saldos.map((s) => <li key={s.materialId} className="flex justify-between p-4 text-[14px]"><span><b>{s.nome}</b> <span className="text-muted">{s.especificacao}</span></span><Qtd v={s.quantidade} u={s.unidade} /></li>)}</ul>}
      </Card>
      {c.saldos.length > 0 && (
        <Card titulo="Transferir para outro técnico, veículo ou almoxarifado">
          <ActionForm action={acaoMovMaterial} className="grid gap-2" resetar><input type="hidden" name="op" value="transferir" /><input type="hidden" name="origemId" value={c.posicao!.id} />
            <select name="materialId" className="select" aria-label="Material">{c.saldos.map((s) => <option key={s.materialId} value={s.materialId}>{s.nome} {s.especificacao ?? ""}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><input name="quantidade" placeholder="Quantidade" className="input" required /><select name="destinoId" className="select" required aria-label="Destino"><option value="">Destino…</option>{pos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <Enviar className="btn btn-ghost">Transferir</Enviar>
          </ActionForm>
          <p className="hint mt-1">Sai da sua custódia agora e entra no destino quando ele confirmar. Nada é criado nem perdido.</p>
        </Card>
      )}
      <Card titulo="Minhas informações aguardando conferência">
        {c.informados.length === 0 ? <p className="text-[13px] text-muted">Nada pendente.</p> : <ul className="space-y-1 text-[13px]">{c.informados.map(({ mov, materialNome, destinoNome }) => <li key={mov.id}><Badge tom="atencao">{rotulo(MATERIAL_MOV_STATUS, mov.status)}</Badge> {rotulo(MATERIAL_MOV_TIPOS, mov.tipo)} · {materialNome} <Qtd v={mov.quantidadeInformada ?? mov.quantidade} u={mov.unidade} /> → {destinoNome} · {fmtDataHora(mov.registradoEm)}</li>)}</ul>}
      </Card>
    </div>
  );
}
