import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { Card, PageHeader } from "@/components/ui";
import { FormCliente } from "@/components/form-cliente";
export const metadata = { title: "Novo cliente" };
export default async function NovoCliente() {
  const ctx = await exigirCtx(); exigir(ctx, "cliente.gerenciar");
  return <div className="max-w-3xl"><PageHeader titulo="Novo cliente" voltar={{ href: "/clientes", rotulo: "Clientes" }} /><Card><FormCliente /></Card></div>;
}
