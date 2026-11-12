import { exigirCtx } from "@/server/auth/sessao";
import { db } from "@/server/db";
import { montarNav } from "@/lib/nav";
import { contarNaoLidas } from "@/server/services/notificacoes";
import { Shell } from "@/components/shell";
import { Marca } from "@/components/ui";
import { sair } from "../(auth)/actions";
import { PAPEIS_PADRAO } from "@/server/auth/permissoes";
import { VINCULOS } from "@/lib/dominio";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirCtx();
  const { itens, tecnico } = montarNav(ctx);
  const naoLidas = await contarNaoLidas(db, ctx);
  const papeis = ctx.papeis.map((c) => PAPEIS_PADRAO.find((p) => p.codigo === c)?.nome ?? c);
  const papel = [ctx.profissional ? VINCULOS[ctx.profissional.vinculo] : null, ...papeis.filter((p) => !ctx.profissional || !p.startsWith("Técnico"))].filter(Boolean).join(" · ");
  return (
    <Shell itens={itens} tecnico={tecnico} usuario={ctx.nome} papel={papel} naoLidas={naoLidas} marca={<Marca compacta />} sair={sair}>
      {children}
    </Shell>
  );
}
