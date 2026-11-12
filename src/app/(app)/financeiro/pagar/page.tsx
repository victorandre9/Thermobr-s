import { exigirCtx } from "@/server/auth/sessao";
import { ListaParcelas } from "@/components/lista-parcelas";
export const metadata = { title: "Contas a pagar" };
export default async function P({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await exigirCtx();
  return <ListaParcelas ctx={ctx} natureza="pagar" sp={await searchParams} />;
}
