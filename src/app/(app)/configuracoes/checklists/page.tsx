import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { checklistModelo, checklistModeloItem } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { acaoModeloChecklist } from "../actions";

export const metadata = { title: "Checklists" };
export default async function Checklists() {
  const ctx = await exigirCtx(); exigir(ctx, "checklist.gerenciar");
  const modelos = await db.select().from(checklistModelo).where(eq(checklistModelo.empresaId, ctx.empresaId)).orderBy(checklistModelo.tipo, desc(checklistModelo.versao));
  const ativos = modelos.filter((m) => m.ativo);
  const itens = await Promise.all(ativos.map(async (m) => ({ id: m.id, itens: await db.select().from(checklistModeloItem).where(and(eq(checklistModeloItem.modeloId, m.id), eq(checklistModeloItem.ativo, true))).orderBy(checklistModeloItem.ordem) })));
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Modelos de checklist" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Cada alteração publica uma nova versão. Respostas concluídas preservam as perguntas e regras da versão utilizada." />
      {ativos.map((m) => {
        const its = itens.find((x) => x.id === m.id)!.itens;
        return (
          <Card key={m.id} titulo={<span className="flex items-center gap-2">{m.nome}<Badge tom="info" icone={false}>v{m.versao}</Badge><Badge tom="neutro" icone={false}>{m.tipo}</Badge></span>}>
            {m.tipo.startsWith("ferramentas") ? <p className="text-[13px] text-muted">Itens gerados a partir das ferramentas (e componentes de conjuntos) sob custódia do técnico.</p> : null}
            <ActionForm action={acaoModeloChecklist} className="space-y-2"><input type="hidden" name="tipo" value={m.tipo} />
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]"><input name="nome" defaultValue={m.nome} className="input" /><input name="validade" defaultValue={m.validadeHoras} className="input" aria-label="Validade (h)" /></div>
              {!m.tipo.startsWith("ferramentas") && <textarea name="itens" rows={Math.max(4, its.length + 1)} className="textarea font-mono text-[12.5px]" defaultValue={its.map((i) => `${i.descricao} | ${i.criticidade} | ${i.exigeFotoIrregular ? "foto" : ""}`).join("\n")} />}
              <p className="hint">Uma linha por item: descrição | criticidade (baixa, media, alta, critica) | “foto” se exigir foto quando irregular.</p>
              <Enviar className="btn btn-primary btn-sm">Publicar nova versão</Enviar>
            </ActionForm>
          </Card>
        );
      })}
      <Card titulo="Versões anteriores (preservadas)"><ul className="text-[12.5px] text-muted">{modelos.filter((m) => !m.ativo).map((m) => <li key={m.id}>{m.tipo} · v{m.versao} · {m.nome}</li>)}</ul></Card>
    </div>
  );
}
