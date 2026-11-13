import { redirect } from "next/navigation";
import { Crown, ClipboardList, Wallet, Wrench, Truck, ChevronRight } from "lucide-react";
import { ActionForm, Enviar } from "@/components/action-form";
import { Marca } from "@/components/ui";
import { obterCtx } from "@/server/auth/sessao";
import { db } from "@/server/db";
import { contasDemo } from "@/server/services/autenticacao";
import { ASSINATURA } from "@/lib/marca";
import { entrar, entrarDemo } from "../actions";

export const metadata = { title: { absolute: "Thermobrás - Projeto de Gestão Integrada" } };

function perfil(papeis: string, vinculo: string | null) {
  if (papeis.includes("gestor")) return { nome: "Gestor geral / aprovador", desc: "Tudo: painel, aprovações, financeiro, configurações", icone: Crown, ordem: 1, cls: "" };
  if (papeis.includes("administrativo")) return { nome: "Administrativo e agenda", desc: "Pedidos, OS, agenda, ferramentas e materiais — sem financeiro", icone: ClipboardList, ordem: 2, cls: "" };
  if (papeis.includes("financeiro_operador")) return { nome: "Financeiro operacional", desc: "Contas, baixas para conferência, cobrança, autônomos", icone: Wallet, ordem: 3, cls: "ok" };
  if (vinculo === "autonomo") return { nome: "Técnico autônomo", desc: "Visitas, ferramentas, materiais e valores próprios — sem checklist de veículo", icone: Wrench, ordem: 4, cls: "warn" };
  return { nome: "Técnico da Thermobrás", desc: "Visitas, ferramentas, materiais e checklist do veículo designado", icone: Truck, ordem: 5, cls: "navy" };
}

export default async function Login() {
  if (await obterCtx()) redirect("/");
  const todas = (await contasDemo(db)).map((d) => ({ ...d, p: perfil(d.papeis, d.vinculo) })).sort((a, b) => a.p.ordem - b.p.ordem || a.nome.localeCompare(b.nome));
  const demos = todas.filter((d, i) => todas.findIndex((x) => x.p.nome === d.p.nome) === i); // um cartão por tipo de usuário
  const form = (
    <ActionForm action={entrar} className="space-y-4">
      <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required className="input" /></div>
      <div><label className="label" htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required className="input" /></div>
      <Enviar className="btn btn-primary btn-lg w-full" pendente="Entrando…">Entrar</Enviar>
    </ActionForm>
  );
  if (demos.length) return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-6 text-center"><div className="inline-block"><Marca /></div><h1 className="mt-4 text-[22px] font-bold text-navy">Como você quer entrar?</h1><p className="text-[13px] text-muted">Escolha o tipo de usuário para ver o aplicativo pelo olhar dele. Dados fictícios de demonstração.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {demos.map((d) => { const I = d.p.icone; return (
            <form key={d.id} action={entrarDemo}>
              <input type="hidden" name="usuarioId" value={d.id} />
              <button type="submit" className="card card-click flex w-full items-center gap-4 p-4 text-left">
                <span className={`ic !h-12 !w-12 ${d.p.cls}`}><I size={22} aria-hidden /></span>
                <span className="min-w-0 flex-1"><b className="block text-[15.5px] text-navy">{d.p.nome}</b><span className="block text-[12.5px] leading-snug text-muted">{d.p.desc}</span></span>
                <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
              </button>
            </form>
          ); })}
        </div>
        <details className="card mx-auto mt-6 max-w-sm p-4"><summary className="cursor-pointer text-[13px] font-semibold text-ice-strong">Entrar com e-mail e senha</summary><div className="mt-4">{form}</div></details>
        <p className="mt-6 text-center text-[11px] text-muted">{ASSINATURA} · em produção esta tela mostra apenas o login</p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className={`grid w-full gap-5 ${demos.length ? "max-w-5xl lg:grid-cols-[380px_minmax(0,1fr)]" : "max-w-sm"}`}>
        <div className="card h-fit p-6 sm:p-8">
          <div className="mb-6"><Marca /></div>
          <h1 className="text-lg font-bold text-navy">Entrar</h1>
          <p className="mb-5 text-[13px] text-muted">Use o e-mail e a senha cadastrados pelo gestor.</p>
          <ActionForm action={entrar} className="space-y-4">
            <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required className="input" /></div>
            <div><label className="label" htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required className="input" /></div>
            <Enviar className="btn btn-primary btn-lg w-full" pendente="Entrando…">Entrar</Enviar>
          </ActionForm>
          <p className="mt-5 text-[12.5px] text-muted">Esqueceu a senha? Peça ao gestor um link de redefinição (válido por 1 hora).</p>
          <p className="mt-4 text-[11px] text-muted">{ASSINATURA}</p>
        </div>
        {demos.length > 0 && (
          <div className="card p-5 sm:p-6">
            <h2 className="text-[16px] font-bold text-navy">Entrar como… (demonstração)</h2>
            <p className="mb-4 text-[12.5px] text-muted">Escolha um tipo de usuário para ver o aplicativo pelo olhar dele. Dados fictícios. Este quadro não aparece em produção.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {demos.map((d) => { const I = d.p.icone; return (
                <form key={d.id} action={entrarDemo}>
                  <input type="hidden" name="usuarioId" value={d.id} />
                  <button type="submit" className="card card-click flex w-full items-center gap-3 p-3.5 text-left">
                    <span className={`ic ${d.p.cls}`}><I size={18} aria-hidden /></span>
                    <span className="min-w-0 flex-1"><b className="block text-[14px] text-navy">{d.p.nome}</b><span className="block truncate text-[12.5px] text-text-2">{d.nome}</span><span className="block text-[11.5px] leading-snug text-muted">{d.p.desc}</span></span>
                    <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
                  </button>
                </form>
              ); })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
