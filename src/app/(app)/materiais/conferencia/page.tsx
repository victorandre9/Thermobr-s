import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { movimentosAguardandoConferencia, listarPosicoes } from "@/server/services/materiais";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader, Qtd, Vazio } from "@/components/ui";
import { MateriaisNav } from "@/components/materiais-nav";
import { MATERIAL_MOV_TIPOS, rotulo } from "@/lib/dominio";
import { fmtDataHora } from "@/lib/datas";
import { acaoMovMaterial } from "../actions";

export const metadata = { title: "Conferência de materiais" };
export default async function Conferencia() {
  const ctx = await exigirCtx();
  const [movs, pos] = await Promise.all([movimentosAguardandoConferencia(db, ctx), listarPosicoes(db, ctx)]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Conferência de materiais" subtitulo="Consumos, devoluções, perdas e peças divergentes informadas por técnicos. Quem informou não confere." />
      <MateriaisNav ativo="/materiais/conferencia" />
      <Card pad={false}>
        {movs.length === 0 ? <Vazio titulo="Nada aguardando conferência" /> : (
          <ul className="divide-y divide-white">{movs.map(({ mov, materialNome, especificacao, origemNome, destinoNome, registradoPorNome, osNumero }) => (
            <li key={mov.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tom="info">{rotulo(MATERIAL_MOV_TIPOS, mov.tipo)}</Badge><b>{materialNome}</b><span className="text-[12.5px] text-muted">{especificacao}</span>{mov.retalho && <Badge tom="neutro" icone={false}>retalho</Badge>}</div>
              <div className="mt-1 text-[13px] text-text-2">Informado: <b><Qtd v={mov.quantidadeInformada ?? mov.quantidade} u={mov.unidade} /></b> · {origemNome} → {destinoNome} · por {registradoPorNome} em {fmtDataHora(mov.registradoEm)}{osNumero && ` · OS ${osNumero}`}{mov.observacao && ` · “${mov.observacao}”`}</div>
              {mov.status === "em_transito" ? <ActionForm action={acaoMovMaterial} className="mt-2"><input type="hidden" name="op" value="confirmar" /><input type="hidden" name="movimentoId" value={mov.id} /><Enviar className="btn btn-ok btn-sm">Confirmar recebimento físico</Enviar></ActionForm> : (mov.tipo === "perda" ? pode(ctx, "divergencia.aprovar") : pode(ctx, "material.conferir")) && (
                <ActionForm action={acaoMovMaterial} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="op" value="conferir" /><input type="hidden" name="movimentoId" value={mov.id} />
                  <input name="quantidade" defaultValue={mov.quantidadeInformada ?? mov.quantidade} className="input !w-32" aria-label={mov.tipo === "devolucao" ? "Quantidade recebida fisicamente" : "Quantidade validada"} />
                  {mov.tipo === "devolucao" && <select name="posicaoId" className="select !w-56" aria-label="Destino">{pos.filter((p) => ["almoxarifado", "veiculo"].includes(p.tipo)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
                  <input name="observacao" placeholder="Observação" className="input !w-56" /><Enviar className="btn btn-ok btn-sm">{mov.tipo === "perda" ? "Aprovar perda" : "Conferir"}</Enviar>
                  <span className="hint w-full">{mov.tipo === "devolucao" ? "Informe o que chegou fisicamente. Se for menor, a diferença vira divergência a localizar (sem baixa automática). 0 = recusar." : "0 = recusar."}</span>
                </ActionForm>
              )}
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
