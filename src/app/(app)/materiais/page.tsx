import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { listarMateriais, listarPosicoes } from "@/server/services/materiais";
import { listarProfissionais } from "@/server/services/usuarios";
import { opcoesOS } from "@/server/services/os";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Dinheiro, PageHeader, Qtd, Vazio } from "@/components/ui";
import { MateriaisNav } from "@/components/materiais-nav";
import { UNIDADE_LABEL } from "@/lib/dominio";
import { toMilli } from "@/lib/quantidade";
import { acaoMaterial, acaoMovMaterial } from "./actions";

export const metadata = { title: "Materiais" };
export default async function Materiais() {
  const ctx = await exigirCtx();
  const [mats, pos] = await Promise.all([listarMateriais(db, ctx), listarPosicoes(db, ctx)]);
  const mov = pode(ctx, "material.movimentar");
  const [profs, oss] = mov ? await Promise.all([listarProfissionais(db, ctx, { somenteAtivos: true }), opcoesOS(db, ctx)]) : [[], []];
  const verCusto = pode(ctx, "material.custos.ver");
  const opMat = mats.map((m) => <option key={m.id} value={m.id}>{m.nome} {m.especificacao ?? ""} ({m.unidade})</option>);
  const opPos = pos.filter((p) => p.tipo === "almoxarifado" || p.tipo === "veiculo").map((p) => <option key={p.id} value={p.id}>{p.nome}</option>);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Materiais e peças" subtitulo="Disponível = estoque físico − reservado. Devolução apenas informada não aumenta o disponível." />
      <MateriaisNav ativo="/materiais" />
      <Card pad={false}>
        {mats.length === 0 ? <Vazio titulo="Nenhum material cadastrado" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Código</th><th>Material / especificação</th><th>Un.</th><th>Estoque</th><th>Reservado</th><th>Disponível</th><th>Em trânsito</th><th>Em custódia</th><th>Segregado</th>{verCusto && <th>Custo ref.</th>}</tr></thead>
            <tbody>{mats.map((m) => { const disp = toMilli(m.estoque) - toMilli(m.reservado); const baixo = m.estoqueMinimo && disp < toMilli(m.estoqueMinimo); return (
              <tr key={m.id}><td className="font-semibold">{m.codigo}</td><td>{m.nome}<div className="text-[12px] text-muted">{m.especificacao}{m.controlaRetalho && " · controla retalho"}</div></td><td>{UNIDADE_LABEL[m.unidade]}</td><td><Qtd v={m.estoque} /></td><td><Qtd v={m.reservado} /></td>
                <td>{baixo ? <Badge tom="atencao">{Number(disp) / 1000} (abaixo do mínimo)</Badge> : <Qtd v={String(Number(disp) / 1000)} />}</td><td><Qtd v={m.transito} /></td><td><Qtd v={m.custodia} /></td><td><Qtd v={m.segregado} /></td>{verCusto && <td><Dinheiro v={m.custoReferenciaCentavos} /></td>}</tr>); })}</tbody></table></div>
        )}
      </Card>
      {mov && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card titulo="Entregar a técnico">
            <ActionForm action={acaoMovMaterial} className="grid gap-2" resetar><input type="hidden" name="op" value="entrega" />
              <select name="materialId" className="select" required aria-label="Material"><option value="">Material…</option>{opMat}</select>
              <div className="grid grid-cols-2 gap-2"><input name="quantidade" placeholder="Quantidade" className="input" required /><select name="posicaoId" className="select" aria-label="Origem">{opPos}</select></div>
              <select name="profissionalId" className="select" required aria-label="Técnico"><option value="">Técnico…</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
              <select name="osId" className="select" aria-label="OS"><option value="">OS (opcional)</option>{oss.map((o) => <option key={o.id} value={o.id}>#{o.numero} {o.descricao.slice(0, 40)}</option>)}</select>
              <Enviar className="btn btn-primary">Registrar entrega</Enviar>
            </ActionForm>
          </Card>
          <Card titulo="Entrada / estoque inicial">
            <ActionForm action={acaoMovMaterial} className="grid gap-2" resetar>
              <select name="op" className="select" aria-label="Tipo"><option value="entrada">Entrada avulsa (recebimento sem compra registrada)</option>{pode(ctx, "material.conferir") && <option value="inicial">Estoque inicial conferido (implantação)</option>}</select>
              <select name="materialId" className="select" required aria-label="Material"><option value="">Material…</option>{opMat}</select>
              <div className="grid grid-cols-2 gap-2"><input name="quantidade" placeholder="Quantidade" className="input" required /><select name="posicaoId" className="select" aria-label="Destino">{opPos}</select></div>
              <Enviar className="btn btn-ghost">Registrar</Enviar>
            </ActionForm>
            <p className="hint mt-2">Compras com conta a pagar: use a aba Compras (evita despesa duplicada).</p>
          </Card>
        </div>
      )}
      {pode(ctx, "material.gerenciar") && (
        <Card titulo="Cadastrar material">
          <ActionForm action={acaoMaterial} className="grid gap-2 sm:grid-cols-4" resetar>
            <input name="codigo" placeholder="Código" className="input" required /><input name="nome" placeholder="Nome (ex.: Tubo de cobre)" className="input" required /><input name="especificacao" placeholder="Bitola/tipo (ex.: 3/8&quot; flexível)" className="input" />
            <select name="unidade" className="select" aria-label="Unidade">{Object.entries(UNIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="categoria" placeholder="Categoria" className="input" /><input name="minimo" placeholder="Estoque mínimo" className="input" />{verCusto && <input name="custo" placeholder="Custo ref. (R$)" className="input" />}
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="retalho" />Controla retalho (preserva comprimento)</label>
            <Enviar className="btn btn-primary sm:col-span-4">Cadastrar</Enviar>
          </ActionForm>
          <p className="hint mt-2">Cada material tem uma única unidade. Não há conversão entre metros, quilos e unidades.</p>
        </Card>
      )}
    </div>
  );
}
