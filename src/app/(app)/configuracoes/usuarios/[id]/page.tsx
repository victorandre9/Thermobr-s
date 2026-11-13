import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { listarUsuarios, listarPapeis, permissoesExtras } from "@/server/services/usuarios";
import { PERMISSOES } from "@/server/auth/permissoes";
import { auditoria } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Badge, Card, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { acaoUsuario } from "../../actions";

export const metadata = { title: "Usuário" };
export default async function Usuario({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); exigir(ctx, "usuario.gerenciar"); const { id } = await params;
  const u = (await listarUsuarios(db, ctx)).find((x) => x.id === id);
  if (!u) return <Aviso tom="critico">Usuário não encontrado.</Aviso>;
  const [papeis, extras, hist] = await Promise.all([listarPapeis(db, ctx), permissoesExtras(db, ctx, id), db.select().from(auditoria).where(and(eq(auditoria.entidadeTipo, "usuario"), eq(auditoria.entidadeId, id))).limit(30)]);
  const eu = id === ctx.usuarioId;
  const H = <input type="hidden" name="usuarioId" value={id} />;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo={u.nome} voltar={{ href: "/configuracoes/usuarios", rotulo: "Usuários" }} subtitulo={<span className="flex gap-2">{u.email} {u.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="neutro">Desativado</Badge>}</span>} />
      {eu && <Aviso tom="info">Você não pode alterar os próprios papéis, permissões ou desativar a si mesmo.</Aviso>}
      <Card titulo="Papéis">
        <ActionForm action={acaoUsuario} className="space-y-3">{H}<input type="hidden" name="op" value="papeis" />
          <div className="flex flex-wrap gap-3">{papeis.map((p) => <label key={p.id} className="flex items-center gap-1 text-[13.5px]"><input type="checkbox" name="papeis" value={p.codigo} defaultChecked={u.papeis.some((x) => x.codigo === p.codigo)} disabled={eu} />{p.nome}{!p.ativo && " (desativado)"}</label>)}</div>
          <input name="motivo" placeholder="Motivo da alteração" className="input" required disabled={eu} /><Enviar className="btn btn-primary btn-sm">Salvar papéis</Enviar>
        </ActionForm>
      </Card>
      <Card titulo="Concessões individuais explícitas">
        <ul className="mb-3 space-y-1 text-[13px]">{extras.length === 0 ? <li className="text-muted">Nenhuma.</li> : extras.map((e) => <li key={e.permissao} className="flex items-center gap-2">{(PERMISSOES as Record<string, string>)[e.permissao]} <Badge tom="neutro" icone={false}>{e.escopo}</Badge>{!eu && <ActionForm action={acaoUsuario} mostrarSucesso={false}>{H}<input type="hidden" name="op" value="revogar" /><input type="hidden" name="permissao" value={e.permissao} /><Enviar className="text-[12px] text-bad underline">revogar</Enviar></ActionForm>}</li>)}</ul>
        {!eu && <ActionForm action={acaoUsuario} className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_auto]">{H}<input type="hidden" name="op" value="conceder" /><select name="permissao" className="select" aria-label="Permissão">{Object.entries(PERMISSOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select name="escopo" className="select" aria-label="Escopo"><option value="empresa">Empresa</option><option value="proprio">Próprio</option></select><input name="motivo" placeholder="Motivo" className="input" required /><Enviar className="btn btn-ghost btn-sm">Conceder</Enviar></ActionForm>}
        <p className="hint mt-2">Ex.: conceder “Confirmar recebimentos e pagamentos já aprovados” ao operador financeiro conforme a política dos donos. Acúmulo de papéis não permite autoaprovação proibida (verificado no servidor).</p>
      </Card>
      {!eu && <Card titulo="Acesso">
        <div className="flex flex-wrap gap-3">
          <ActionForm action={acaoUsuario}>{H}<input type="hidden" name="op" value="redefinir" /><Enviar className="btn btn-ghost">Gerar link de redefinição de senha</Enviar></ActionForm>
          <ActionForm action={acaoUsuario} className="flex gap-2" confirmar={u.ativo ? "Desativar este usuário? O histórico é preservado." : undefined}>{H}<input type="hidden" name="op" value="ativo" /><input type="hidden" name="ativo" value={u.ativo ? "0" : "1"} /><input name="motivo" placeholder="Motivo" className="input !w-56" required /><Enviar className={u.ativo ? "btn btn-danger" : "btn btn-ok"}>{u.ativo ? "Desativar" : "Reativar"}</Enviar></ActionForm>
        </div>
      </Card>}
      <Card titulo="Histórico"><ul className="space-y-1 text-[12.5px]">{hist.map((h) => <li key={h.id}>{fmtDataHora(h.em)} · {h.acao === "login.demo" ? "login (demonstrativo)" : h.acao}{h.motivo && ` — ${h.motivo}`}</li>)}</ul></Card>
    </div>
  );
}
