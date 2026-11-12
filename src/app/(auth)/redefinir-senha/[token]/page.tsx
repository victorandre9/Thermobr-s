import { ActionForm, Enviar } from "@/components/action-form";
import { Marca } from "@/components/ui";
import { redefinir } from "../../actions";

export const metadata = { title: "Redefinir senha" };

export default async function Redefinir({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6"><Marca /></div>
        <h1 className="text-lg font-bold text-navy">Definir nova senha</h1>
        <ActionForm action={redefinir} className="mt-4 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div><label className="label" htmlFor="senha">Nova senha</label><input id="senha" name="senha" type="password" minLength={10} required className="input" autoComplete="new-password" /><div className="hint">Mínimo de 10 caracteres, com letras e números.</div></div>
          <div><label className="label" htmlFor="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" minLength={10} required className="input" autoComplete="new-password" /></div>
          <Enviar className="btn btn-primary btn-lg w-full">Salvar senha</Enviar>
        </ActionForm>
      </div>
    </div>
  );
}
