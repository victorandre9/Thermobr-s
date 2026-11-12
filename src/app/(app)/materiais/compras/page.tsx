import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir, pode } from "@/server/auth/contexto";
import { listarMateriais } from "@/server/services/materiais";
import { listarFornecedores } from "@/server/services/cadastros";
import { opcoesOS } from "@/server/services/os";
import { compra, fornecedor } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { MateriaisNav } from "@/components/materiais-nav";
import { fmtDia, hojeSP } from "@/lib/datas";
import { acaoCompra } from "../actions";

export const metadata = { title: "Compras" };
export default async function Compras() {
  const ctx = await exigirCtx(); exigir(ctx, "material.movimentar");
  const [mats, forns, oss, compras] = await Promise.all([listarMateriais(db, ctx), listarFornecedores(db, ctx), opcoesOS(db, ctx), db.select({ c: compra, f: fornecedor.nome }).from(compra).leftJoin(fornecedor, eq(fornecedor.id, compra.fornecedorId)).where(eq(compra.empresaId, ctx.empresaId)).orderBy(desc(compra.criadoEm)).limit(50)]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Compras diretas e complementares" subtitulo="Compra → recebimento físico → conta a pagar ficam vinculados: registrar a entrega não duplica a despesa." />
      <MateriaisNav ativo="/materiais/compras" />
      <Card titulo="Registrar compra">
        <ActionForm action={acaoCompra} className="space-y-3" resetar>
          <div className="grid gap-2 sm:grid-cols-4"><select name="fornecedorId" className="select" aria-label="Fornecedor"><option value="">Fornecedor…</option>{forns.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select><input type="date" name="data" defaultValue={hojeSP()} className="input" aria-label="Data" /><input name="documento" placeholder="Nº documento/NF" className="input" /><select name="osId" className="select" aria-label="OS"><option value="">OS (opcional)</option>{oss.map((o) => <option key={o.id} value={o.id}>#{o.numero}</option>)}</select></div>
          {[0, 1, 2, 3].map((i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_140px]"><select name={`m${i}`} className="select" aria-label="Material"><option value="">Material…</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nome} {m.especificacao ?? ""} ({m.unidade})</option>)}</select><input name={`q${i}`} placeholder="Qtd." className="input" /><input name={`c${i}`} placeholder="Custo un. (R$)" className="input" /></div>)}
          <div className="flex flex-wrap items-center gap-4 text-[13.5px]"><label className="flex items-center gap-2"><input type="checkbox" name="receber" defaultChecked />Material já recebido (entra no almoxarifado)</label><label className="flex items-center gap-2"><input type="checkbox" name="obrigacao" defaultChecked />Gerar conta a pagar</label><label className="flex items-center gap-2">Vencimento <input type="date" name="vencimento" defaultValue={hojeSP()} className="input !w-40" /></label></div>
          <p className="hint">A conta a pagar fica aguardando aprovação do gestor (exceto se lançada por ele).</p>
          <Enviar>Registrar compra</Enviar>
        </ActionForm>
      </Card>
      <Card titulo="Compras recentes"><ul className="space-y-1 text-[13px]">{compras.map(({ c, f }) => <li key={c.id}>{fmtDia(c.data)} · {f ?? "sem fornecedor"} · doc {c.documento ?? "—"} · <Badge tom={c.situacao === "recebida" ? "ok" : "atencao"}>{c.situacao}</Badge>{c.obrigacaoId && pode(ctx, "financeiro.ver") && <> · <a className="text-ice-strong underline" href={`/financeiro/obrigacoes/${c.obrigacaoId}`}>conta a pagar</a></>}</li>)}</ul></Card>
    </div>
  );
}
