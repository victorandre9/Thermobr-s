import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarContratos, opcoesClientes } from "@/server/services/cadastros";
import { ActionForm, Enviar } from "@/components/action-form";
import { Card, Dinheiro, PageHeader, Vazio, Badge } from "@/components/ui";
import { fmtDia, hojeSP } from "@/lib/datas";
import { acaoContrato } from "../clientes/actions";

export const metadata = { title: "Contratos" };
export default async function Contratos() {
  const ctx = await exigirCtx();
  const rows = await listarContratos(db, ctx);
  const verValor = pode(ctx, "contrato.valores.ver");
  const clientes = pode(ctx, "contrato.gerenciar") ? await opcoesClientes(db, ctx) : [];
  return (
    <div className="space-y-5">
      <PageHeader titulo="Contratos" subtitulo="Mensalidade por competência (uma por contrato/mês). Visitas incluídas não geram nova mensalidade." />
      <Card pad={false}>
        {rows.length === 0 ? <Vazio titulo="Nenhum contrato" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Nº</th><th>Cliente</th><th>Cobertura</th><th>Vigência</th><th>Venc.</th><th>Visitas/mês</th>{verValor && <th>Valor mensal</th>}<th>Situação</th></tr></thead>
            <tbody>{rows.map((k) => <tr key={k.id}><td className="font-semibold">{k.numero}</td><td>{k.clienteNome}</td><td className="max-w-xs text-[12.5px]">{k.cobertura ?? "—"}</td><td className="text-[12.5px]">{fmtDia(k.inicio)} – {k.fim ? fmtDia(k.fim) : "indeterminado"}</td><td>dia {k.diaVencimento}</td><td>{k.visitasIncluidasMes ?? "—"}</td>{verValor && <td>{k.valorMensalCentavos === null ? <span className="text-[12px] text-warn">Sem valor (não gera cobrança)</span> : <Dinheiro v={k.valorMensalCentavos} />}</td>}<td><Badge tom={k.status === "ativo" ? "ok" : "neutro"}>{k.status}</Badge></td></tr>)}</tbody></table></div>
        )}
      </Card>
      {pode(ctx, "contrato.gerenciar") && (
        <Card titulo="Novo contrato">
          <ActionForm action={acaoContrato} className="grid gap-2 sm:grid-cols-3" resetar>
            <select name="clienteId" className="select" required aria-label="Cliente"><option value="">Cliente…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <input name="numero" placeholder="Número" className="input" required /><input name="descricao" placeholder="Descrição" className="input" />
            <input name="cobertura" placeholder="Cobertura" className="input sm:col-span-2" />{verValor ? <input name="valor" placeholder="Valor mensal (R$)" className="input" /> : <span className="hint">Valor: restrito ao financeiro/gestor</span>}
            <label className="text-[12px]">Início<input type="date" name="inicio" defaultValue={hojeSP()} className="input" required /></label><label className="text-[12px]">Fim (opcional)<input type="date" name="fim" className="input" /></label>
            <div className="grid grid-cols-2 gap-2"><input name="diaVencimento" placeholder="Dia venc." defaultValue="10" className="input" /><input name="visitas" placeholder="Visitas/mês" className="input" /></div>
            <Enviar className="btn btn-primary sm:col-span-3">Cadastrar contrato</Enviar>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
