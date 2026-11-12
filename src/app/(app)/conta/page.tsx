import { exigirCtx } from "@/server/auth/sessao";
import { ActionForm, Enviar } from "@/components/action-form";
import { Aviso, Card, Campo, Dl, PageHeader } from "@/components/ui";
import { PERMISSOES } from "@/server/auth/permissoes";
import { VINCULOS } from "@/lib/dominio";
import { acaoTrocarSenha } from "./actions";

export const metadata = { title: "Minha conta" };
export default async function Conta({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx(); const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader titulo="Minha conta" />
      {sp.trocar && <Aviso tom="atencao">Defina uma nova senha pessoal antes de continuar.</Aviso>}
      <Card><Dl itens={[["Nome", ctx.nome], ["E-mail", ctx.email], ["Papéis", ctx.papeis.join(", ")], ["Vínculo profissional", ctx.profissional ? VINCULOS[ctx.profissional.vinculo] : "—"]]} />
        <details className="mt-3"><summary className="cursor-pointer text-[13px] text-ice-strong">Minhas permissões</summary><ul className="mt-2 text-[12.5px] text-muted">{[...ctx.grants.entries()].map(([p, e]) => <li key={p}>{(PERMISSOES as Record<string, string>)[p] ?? p} — {e === "proprio" ? "somente próprios registros" : "empresa"}</li>)}</ul></details></Card>
      <Card titulo="Trocar senha">
        <ActionForm action={acaoTrocarSenha} className="space-y-3" resetar>
          <Campo rotulo="Senha atual" nome="atual"><input id="atual" type="password" name="atual" className="input" required autoComplete="current-password" /></Campo>
          <Campo rotulo="Nova senha" nome="nova" dica="Mínimo 10 caracteres, letras e números."><input id="nova" type="password" name="nova" className="input" required minLength={10} autoComplete="new-password" /></Campo>
          <Campo rotulo="Repita a nova senha" nome="nova2"><input id="nova2" type="password" name="nova2" className="input" required minLength={10} autoComplete="new-password" /></Campo>
          <Enviar>Salvar nova senha</Enviar>
        </ActionForm>
      </Card>
    </div>
  );
}
