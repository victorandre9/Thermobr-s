import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { listarCategorias } from "@/server/services/financeiro";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { centavosParaInput } from "@/lib/money";
import { acaoCategoria } from "../actions";

export const metadata = { title: "Categorias financeiras" };
export default async function Categorias() {
  const ctx = await exigirCtx(); exigir(ctx, "configuracao.gerenciar"); exigir(ctx, "financeiro.aprovar");
  const cats = await listarCategorias(db, ctx);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Categorias financeiras" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Dupla aprovação é opcional e definida pelos donos (vazio = não exige; 0 = sempre). O sistema não presume limites." />
      <Card pad={false}><ul className="divide-y divide-white">{cats.map((c) => (
        <li key={c.id} className="p-3"><ActionForm action={acaoCategoria} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={c.id} /><span className="min-w-56 flex-1 text-[13.5px]"><b>{c.nome}</b> <span className="text-muted">({c.natureza})</span></span>
          <label className="text-[12.5px]">Dupla aprovação a partir de R$ <input name="limite" defaultValue={centavosParaInput(c.duplaAprovacaoAcimaCentavos)} className="input !w-32" /></label>
          <label className="flex items-center gap-1 text-[12.5px]"><input type="checkbox" name="restrita" defaultChecked={c.restrita} />Restrita</label><Enviar className="btn btn-ghost btn-sm">Salvar</Enviar></ActionForm></li>
      ))}</ul></Card>
    </div>
  );
}
