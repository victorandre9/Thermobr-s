/** Regras de autenticação independentes do Next (testáveis). */
import { and, eq, gt, isNull, sql, count } from "drizzle-orm";
import { qc } from "../db/sql";
import type { DBOrTx } from "../db";
import { loginTentativa, redefinicaoSenha, sessao, usuario } from "../db/schema";
import { conferirSenha, gerarToken, hashSenha, hashToken, validarForcaSenha } from "../auth/senha";
import { ErroNegocio } from "../erros";
import { auditar } from "./auditoria";

export const SESSAO_DIAS = 7;
const MAX_TENTATIVAS = 5;
const JANELA_MIN = 15;

export async function autenticar(dbx: DBOrTx, email: string, senha: string, userAgent?: string | null) {
  const em = email.trim().toLowerCase();
  const [{ n }] = await dbx.select({ n: count() }).from(loginTentativa)
    .where(and(eq(loginTentativa.email, em), eq(loginTentativa.sucesso, false), gt(loginTentativa.em, sql`now() - make_interval(mins => ${JANELA_MIN})`)));
  if (n >= MAX_TENTATIVAS) throw new ErroNegocio(`Muitas tentativas. Aguarde ${JANELA_MIN} minutos ou peça ao gestor um link de redefinição.`);
  const [u] = await dbx.select().from(usuario).where(sql`lower(${qc(usuario.email)}) = ${em}`);
  const ok = !!u && !!u.senhaHash && u.ativo && !(u.demo && process.env.APP_ENV === "production") && (await conferirSenha(senha, u.senhaHash));
  await dbx.insert(loginTentativa).values({ email: em, sucesso: ok });
  if (!ok || !u) throw new ErroNegocio("E-mail ou senha inválidos.");
  const token = gerarToken();
  const expira = new Date(Date.now() + SESSAO_DIAS * 86400000);
  await dbx.insert(sessao).values({ usuarioId: u.id, tokenHash: hashToken(token), expiraEm: expira, userAgent: userAgent?.slice(0, 300) ?? null });
  await dbx.update(usuario).set({ ultimoLoginEm: new Date() }).where(eq(usuario.id, u.id));
  return { token, expira, usuarioId: u.id, deveTrocarSenha: u.deveTrocarSenha };
}

export async function validarSessao(dbx: DBOrTx, token: string) {
  const th = hashToken(token);
  const [s] = await dbx.select().from(sessao).where(and(eq(sessao.tokenHash, th), isNull(sessao.revogadaEm), gt(sessao.expiraEm, new Date())));
  if (!s) return null;
  // renovação deslizante (no máximo 1x por hora)
  if (Date.now() - s.ultimoUsoEm.getTime() > 3600000) {
    await dbx.update(sessao).set({ ultimoUsoEm: new Date(), expiraEm: new Date(Date.now() + SESSAO_DIAS * 86400000) }).where(eq(sessao.id, s.id));
  }
  return s;
}

export async function revogarSessao(dbx: DBOrTx, token: string) {
  await dbx.update(sessao).set({ revogadaEm: new Date() }).where(eq(sessao.tokenHash, hashToken(token)));
}

export async function revogarTodasSessoes(dbx: DBOrTx, usuarioId: string) {
  await dbx.update(sessao).set({ revogadaEm: new Date() }).where(and(eq(sessao.usuarioId, usuarioId), isNull(sessao.revogadaEm)));
}

export async function trocarSenha(dbx: DBOrTx, usuarioId: string, atual: string, nova: string) {
  const [u] = await dbx.select().from(usuario).where(eq(usuario.id, usuarioId));
  if (!u?.senhaHash || !(await conferirSenha(atual, u.senhaHash))) throw new ErroNegocio("Senha atual incorreta.");
  const f = validarForcaSenha(nova); if (f) throw new ErroNegocio(f);
  await dbx.update(usuario).set({ senhaHash: await hashSenha(nova), deveTrocarSenha: false, atualizadoEm: new Date() }).where(eq(usuario.id, usuarioId));
  await auditar(dbx, { usuarioId, empresaId: u.empresaId }, { acao: "senha.trocada", entidadeTipo: "usuario", entidadeId: usuarioId });
}

/** Gestor emite link de uso único (1h). Sem provedor de e-mail configurado, o gestor entrega o link ao usuário. */
export async function emitirRedefinicao(dbx: DBOrTx, empresaId: string, gestorId: string, usuarioId: string) {
  const [u] = await dbx.select().from(usuario).where(and(eq(usuario.id, usuarioId), eq(usuario.empresaId, empresaId)));
  if (!u) throw new ErroNegocio("Usuário não encontrado.");
  const token = gerarToken();
  await dbx.insert(redefinicaoSenha).values({ usuarioId, tokenHash: hashToken(token), expiraEm: new Date(Date.now() + 3600000), criadoPor: gestorId });
  await auditar(dbx, { usuarioId: gestorId, empresaId }, { acao: "senha.redefinicao_emitida", entidadeTipo: "usuario", entidadeId: usuarioId });
  return token;
}

export async function redefinirComToken(dbx: DBOrTx, token: string, nova: string) {
  const f = validarForcaSenha(nova); if (f) throw new ErroNegocio(f);
  const th = hashToken(token);
  const [r] = await dbx.update(redefinicaoSenha).set({ usadoEm: new Date() })
    .where(and(eq(redefinicaoSenha.tokenHash, th), isNull(redefinicaoSenha.usadoEm), gt(redefinicaoSenha.expiraEm, new Date())))
    .returning();
  if (!r) throw new ErroNegocio("Link inválido ou expirado. Peça um novo ao gestor.");
  const [u] = await dbx.update(usuario).set({ senhaHash: await hashSenha(nova), deveTrocarSenha: false, atualizadoEm: new Date() }).where(eq(usuario.id, r.usuarioId)).returning();
  await revogarTodasSessoes(dbx, r.usuarioId);
  await auditar(dbx, { usuarioId: r.usuarioId, empresaId: u.empresaId }, { acao: "senha.redefinida", entidadeTipo: "usuario", entidadeId: r.usuarioId });
}

/** Entrada rápida em conta de DEMONSTRAÇÃO (somente fora de produção e somente usuários demo). */
export async function autenticarDemo(dbx: DBOrTx, usuarioId: string, userAgent?: string | null) {
  if (process.env.APP_ENV === "production") throw new ErroNegocio("Acesso de demonstração indisponível em produção.");
  const [u] = await dbx.select().from(usuario).where(eq(usuario.id, usuarioId));
  if (!u || !u.demo || !u.ativo) throw new ErroNegocio("Conta de demonstração não encontrada.");
  const token = gerarToken();
  const expira = new Date(Date.now() + SESSAO_DIAS * 86400000);
  await dbx.insert(sessao).values({ usuarioId: u.id, tokenHash: hashToken(token), expiraEm: expira, userAgent: userAgent?.slice(0, 300) ?? null });
  await dbx.update(usuario).set({ ultimoLoginEm: new Date() }).where(eq(usuario.id, u.id));
  await auditar(dbx, { usuarioId: u.id, empresaId: u.empresaId }, { acao: "login.demo", entidadeTipo: "usuario", entidadeId: u.id });
  return { token, expira };
}

/** Lista contas demo para a tela inicial (vazia em produção). */
export async function contasDemo(dbx: DBOrTx) {
  if (process.env.APP_ENV === "production") return [];
  const r = await dbx.execute<{ id: string; nome: string; email: string; papeis: string; vinculo: string | null }>(sql`
    select u.id, u.nome, u.email, coalesce(string_agg(p.codigo, ',' order by p.codigo), '') as papeis,
      (select pr.vinculo from profissional pr where pr.usuario_id = u.id) as vinculo
    from usuario u left join usuario_papel up on up.usuario_id = u.id left join papel p on p.id = up.papel_id
    where u.demo and u.ativo group by u.id order by u.nome`);
  return r.rows;
}
