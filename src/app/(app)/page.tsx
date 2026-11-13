import { cookies } from "next/headers";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { visoesDisponiveis, type Visao } from "@/server/services/inicio";
import { Vazio } from "@/components/ui";
import { HomeTecnico } from "./_home/tecnico";
import { HomeGestor } from "./_home/gestor";
import { HomeAdministrativo } from "./_home/administrativo";
import { HomeFinanceiro } from "./_home/financeiro";

export const metadata = { title: "Início" };

/** Página inicial por perfil. Técnicos mantêm a tela própria. A visão escolhida só reorganiza a página. */
export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx();
  const sp = await searchParams;
  if (!pode(ctx, "os.ver", "empresa") && ctx.profissional) return <HomeTecnico ctx={ctx} />;
  const vs = visoesDisponiveis(ctx);
  const pref = (await cookies()).get("tb_visao")?.value as Visao | undefined;
  const visao: Visao | undefined = pref && vs.includes(pref) ? pref : vs[0];
  if (visao === "gestor") return <HomeGestor ctx={ctx} sp={sp} />;
  if (visao === "administrativo") return <HomeAdministrativo ctx={ctx} sp={sp} />;
  if (visao === "financeiro") return <HomeFinanceiro ctx={ctx} sp={sp} />;
  return <Vazio titulo="Bem-vindo">Use o menu para acessar as áreas liberadas para o seu perfil.</Vazio>;
}
