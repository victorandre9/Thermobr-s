import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { exigir } from "@/server/auth/contexto";
import { listarProfissionais } from "@/server/services/usuarios";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { VINCULOS } from "@/lib/dominio";
import { acaoProfissional } from "../actions";

export const metadata = { title: "Profissionais" };
export default async function Profissionais() {
  const ctx = await exigirCtx(); exigir(ctx, "profissional.gerenciar");
  const ps = await listarProfissionais(db, ctx);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Profissionais" voltar={{ href: "/configuracoes", rotulo: "Configurações" }} subtitulo="Cadastre a estrutura real (não presuma que toda a equipe própria é técnica). Competências e regiões alimentam a recomendação de técnicos." />
      <div className="space-y-3">{ps.map((p) => (
        <Card key={p.id}>
          <ActionForm action={acaoProfissional} className="grid gap-2 sm:grid-cols-[1.2fr_150px_130px_1fr_1fr_100px_auto]"><input type="hidden" name="id" value={p.id} />
            <div><b className="text-navy">{p.nome}</b> {!p.ativo && <Badge tom="neutro">inativo</Badge>}<div className="text-[12px] text-muted">{p.usuarioId ? "com login" : "sem login"}{p.veiculoId ? " · com veículo" : ""}</div></div>
            <select name="vinculo" defaultValue={p.vinculo} className="select" aria-label="Vínculo" disabled={!ctx.papeis.includes("gestor")}>{Object.entries(VINCULOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select name="funcao" defaultValue={p.funcao} className="select" aria-label="Função">{["tecnico", "ajudante", "administrativo", "comercial", "outro"].map((f) => <option key={f}>{f}</option>)}</select>
            <input name="competencias" defaultValue={p.competencias.join(", ")} placeholder="Competências (vírgula)" className="input" aria-label="Competências" />
            <input name="regioes" defaultValue={p.regioes.join(", ")} placeholder="Regiões (bairros/cidades)" className="input" aria-label="Regiões" />
            <select name="ativo" defaultValue={p.ativo ? "1" : "0"} className="select" aria-label="Ativo"><option value="1">Ativo</option><option value="0">Inativo</option></select>
            <Enviar className="btn btn-ghost btn-sm">Salvar</Enviar>
          </ActionForm>
        </Card>
      ))}</div>
      <Card titulo="Novo profissional (sem login)">
        <ActionForm action={acaoProfissional} className="grid gap-2 sm:grid-cols-5" resetar><input name="nome" placeholder="Nome" className="input" required /><select name="vinculo" className="select"><option value="proprio">Equipe própria</option><option value="autonomo">Autônomo</option></select><select name="funcao" className="select">{["tecnico", "ajudante", "administrativo", "comercial", "outro"].map((f) => <option key={f}>{f}</option>)}</select><input name="telefone" placeholder="Telefone" className="input" /><Enviar className="btn btn-primary">Cadastrar</Enviar></ActionForm>
      </Card>
    </div>
  );
}
