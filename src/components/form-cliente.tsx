import { ActionForm, Enviar } from "./action-form";
import { Campo } from "./ui";
import { acaoCliente } from "@/app/(app)/clientes/actions";

export function FormCliente({ c }: { c?: { id: string; tipo: string; nome: string; documento: string | null; email: string | null; telefone: string | null; observacoes: string | null; versao: number } }) {
  return (
    <ActionForm action={acaoCliente} className="grid gap-3 sm:grid-cols-2">
      {c && <><input type="hidden" name="id" value={c.id} /><input type="hidden" name="versao" value={c.versao} /></>}
      <Campo rotulo="Nome / razão social" nome="nome" obrigatorio><input id="nome" name="nome" defaultValue={c?.nome} className="input" required /></Campo>
      <Campo rotulo="Tipo" nome="tipo"><select id="tipo" name="tipo" defaultValue={c?.tipo ?? "PJ"} className="select"><option value="PJ">Pessoa jurídica</option><option value="PF">Pessoa física</option></select></Campo>
      <Campo rotulo="CPF/CNPJ" nome="documento"><input id="documento" name="documento" defaultValue={c?.documento ?? ""} className="input" /></Campo>
      <Campo rotulo="Telefone" nome="telefone"><input id="telefone" name="telefone" defaultValue={c?.telefone ?? ""} className="input" /></Campo>
      <Campo rotulo="E-mail" nome="email"><input id="email" type="email" name="email" defaultValue={c?.email ?? ""} className="input" /></Campo>
      <Campo rotulo="Observações" nome="observacoes"><input id="observacoes" name="observacoes" defaultValue={c?.observacoes ?? ""} className="input" /></Campo>
      <div className="sm:col-span-2"><Enviar>Salvar</Enviar></div>
    </ActionForm>
  );
}
