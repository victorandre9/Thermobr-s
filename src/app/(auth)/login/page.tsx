import { redirect } from "next/navigation";
import { ActionForm, Enviar } from "@/components/action-form";
import { Marca } from "@/components/ui";
import { obterCtx } from "@/server/auth/sessao";
import { ASSINATURA } from "@/lib/marca";
import { entrar } from "../actions";

export const metadata = { title: "Entrar" };

export default async function Login() {
  if (await obterCtx()) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="card p-6 sm:p-8">
          <div className="mb-6"><Marca /></div>
          <h1 className="text-lg font-bold text-navy">Entrar</h1>
          <p className="mb-5 text-[13px] text-muted">Use o e-mail e a senha cadastrados pelo gestor.</p>
          <ActionForm action={entrar} className="space-y-4">
            <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required className="input" /></div>
            <div><label className="label" htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required className="input" /></div>
            <Enviar className="btn btn-primary btn-lg w-full" pendente="Entrando…">Entrar</Enviar>
          </ActionForm>
          <p className="mt-5 text-[12.5px] text-muted">Esqueceu a senha? Peça ao gestor um link de redefinição (válido por 1 hora).</p>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted">{ASSINATURA}</p>
      </div>
    </div>
  );
}
