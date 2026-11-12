import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { listarFornecedores } from "@/server/services/cadastros";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { acaoFornecedor } from "../actions";

export const metadata = { title: "Fornecedores" };
export default async function Fornecedores() {
  const ctx = await exigirCtx();
  const fs = await listarFornecedores(db, ctx);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Fornecedores" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} />
      <Card pad={false}><ul className="divide-y divide-white">{fs.length === 0 ? <li className="p-4 text-[13px] text-muted">Nenhum.</li> : fs.map((f) => <li key={f.id} className="p-3"><ActionForm action={acaoFornecedor} className="grid gap-2 sm:grid-cols-5"><input type="hidden" name="id" value={f.id} /><input name="nome" defaultValue={f.nome} className="input" /><input name="documento" defaultValue={f.documento ?? ""} placeholder="CNPJ" className="input" /><input name="telefone" defaultValue={f.telefone ?? ""} placeholder="Telefone" className="input" /><input name="email" defaultValue={f.email ?? ""} placeholder="E-mail" className="input" /><Enviar className="btn btn-ghost btn-sm">Salvar</Enviar></ActionForm></li>)}</ul></Card>
      <Card titulo="Novo fornecedor"><ActionForm action={acaoFornecedor} className="grid gap-2 sm:grid-cols-5" resetar><input name="nome" placeholder="Nome" className="input" required /><input name="documento" placeholder="CNPJ" className="input" /><input name="telefone" placeholder="Telefone" className="input" /><input name="email" placeholder="E-mail" className="input" /><Enviar className="btn btn-primary btn-sm">Cadastrar</Enviar></ActionForm></Card>
    </div>
  );
}
