import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { saldosPorPosicao, custodiasAntigas } from "@/server/services/materiais";
import { obterConfig } from "@/server/services/config";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader, Qtd, Vazio } from "@/components/ui";
import { MateriaisNav } from "@/components/materiais-nav";
import { fmtDataHora } from "@/lib/datas";
import { acaoMovMaterial } from "../actions";

export const metadata = { title: "Custódias e saldos" };
export default async function Custodias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  const cfg = await obterConfig(db, ctx.empresaId);
  const saldos = await saldosPorPosicao(db, ctx);
  const antigas = sp.antigas ? await custodiasAntigas(db, ctx, cfg.materiais.prazoCustodiaDias) : null;
  return (
    <div className="space-y-5">
      <PageHeader titulo="Custódias e saldos por posição" subtitulo="Saldo esperado (sistema) e saldo físico conferido (última contagem) são exibidos separadamente." />
      <MateriaisNav ativo="/materiais/custodias" />
      {antigas && <Card titulo={`Sob custódia há mais de ${cfg.materiais.prazoCustodiaDias} dias (${antigas.length})`}>{antigas.length === 0 ? <p className="text-[13px] text-muted">Nenhuma.</p> : <ul className="text-[13.5px]">{antigas.map((a, i) => <li key={i}>{a.posicaoNome}: {a.materialNome} <Qtd v={a.quantidade} u={a.unidade} /> desde {fmtDataHora(a.desde)}</li>)}</ul>}</Card>}
      <Card pad={false}>
        {saldos.length === 0 ? <Vazio titulo="Sem saldos" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Posição</th><th>Material</th><th>Saldo esperado</th><th>Reservado</th><th>Último físico conferido</th>{pode(ctx, "material.conferir") && <th>Registrar contagem</th>}</tr></thead>
            <tbody>{saldos.map((s) => <tr key={s.posicaoId + s.materialId}><td>{s.posicaoNome}<div className="text-[11.5px] text-muted">{s.posicaoTipo}</div></td><td>{s.materialNome} <span className="text-muted">{s.especificacao}</span></td><td><Qtd v={s.quantidade} u={s.unidade} /></td><td><Qtd v={s.reservado} /></td>
              <td>{s.ultimaContagem !== null ? <><Qtd v={s.ultimaContagem} u={s.unidade} /> {Number(s.ultimaContagem) !== Number(s.quantidade) && <Badge tom="atencao">difere</Badge>}<div className="text-[11.5px] text-muted">{fmtDataHora(s.ultimaContagemEm)}</div></> : <span className="text-[12px] text-muted">Nunca contado</span>}</td>
              {pode(ctx, "material.conferir") && <td><ActionForm action={acaoMovMaterial} className="flex gap-1"><input type="hidden" name="op" value="contagem" /><input type="hidden" name="materialId" value={s.materialId} /><input type="hidden" name="posicaoId" value={s.posicaoId} /><input name="quantidade" placeholder="Contado" className="input !w-24" required /><Enviar className="btn btn-ghost btn-sm">OK</Enviar></ActionForm></td>}</tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
