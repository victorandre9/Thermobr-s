import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { listarUsuarios, listarPapeis } from "@/server/services/usuarios";
import { profissional } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { fmtDataHora } from "@/lib/datas";
import { VINCULOS } from "@/lib/dominio";
import { acaoNovoUsuario } from "../actions";

export const metadata = { title: "Usuários" };
export default async function Usuarios() {
  const ctx = await exigirCtx(); exigir(ctx, "usuario.gerenciar");
  const [us, papeis, semUsuario] = await Promise.all([listarUsuarios(db, ctx), listarPapeis(db, ctx), db.select().from(profissional).where(and(eq(profissional.empresaId, ctx.empresaId), isNull(profissional.usuarioId)))]);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Usuários e permissões" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Vínculo profissional é separado das permissões. Ninguém altera os próprios acessos." />
      <Card pad={false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Usuário</th><th>Papéis</th><th>Vínculo profissional</th><th>Último acesso</th><th>Situação</th></tr></thead>
        <tbody>{us.map((u) => <tr key={u.id}><td><Link href={`/configuracoes/usuarios/${u.id}`} className="font-semibold text-navy hover:underline">{u.nome}</Link><div className="text-[12px] text-muted">{u.email}</div></td><td className="text-[12.5px]">{u.papeis.map((p) => p.nome).join(", ") || "—"}</td><td className="text-[12.5px]">{u.profissional ? VINCULOS[u.profissional.vinculo as "autonomo"] : "—"}</td><td className="text-[12.5px]">{u.ultimoLoginEm ? fmtDataHora(u.ultimoLoginEm) : "nunca"}</td><td>{u.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="neutro">Desativado</Badge>}{u.demo && <Badge tom="neutro" icone={false}>demo</Badge>}</td></tr>)}</tbody></table></div></Card>
      <Card titulo="Novo usuário">
        <ActionForm action={acaoNovoUsuario} className="grid gap-3 sm:grid-cols-2" resetar>
          <input name="nome" placeholder="Nome" className="input" required /><input name="email" type="email" placeholder="E-mail" className="input" required />
          <input name="senha" type="password" placeholder="Senha inicial (mín. 10, letras e números)" className="input" required minLength={10} autoComplete="new-password" />
          <fieldset className="sm:col-span-2"><legend className="label">Papéis (pode acumular)</legend><div className="flex flex-wrap gap-3">{papeis.filter((p) => p.ativo).map((p) => <label key={p.id} className="flex items-center gap-1 text-[13px]"><input type="checkbox" name="papeis" value={p.codigo} />{p.nome}</label>)}</div></fieldset>
          <select name="vinculo" className="select" aria-label="Vínculo"><option value="">Sem vínculo profissional</option><option value="autonomo">Técnico autônomo</option><option value="proprio">Equipe própria</option></select>
          <select name="profissionalId" className="select" aria-label="Profissional existente"><option value="">…ou vincular a profissional já cadastrado</option>{semUsuario.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <Enviar className="btn btn-primary sm:col-span-2">Criar usuário</Enviar>
        </ActionForm>
      </Card>
    </div>
  );
}
