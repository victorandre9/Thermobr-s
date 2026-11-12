import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { HomeGestao } from "./_home/gestao";
import { HomeTecnico } from "./_home/tecnico";

export const metadata = { title: "Início" };

export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx();
  const sp = await searchParams;
  if (!pode(ctx, "os.ver", "empresa") && ctx.profissional) return <HomeTecnico ctx={ctx} />;
  return <HomeGestao ctx={ctx} de={sp.de} ate={sp.ate} />;
}
