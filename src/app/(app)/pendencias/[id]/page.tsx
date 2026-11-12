import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { exigirCtx } from "@/server/auth/sessao";
import { pode } from "@/server/auth/contexto";
import { obterPendencia } from "@/server/services/pendencias";
import { listarAnexos } from "@/server/services/anexos";
import { usuario } from "@/server/db/schema";
import { ActionForm, Enviar } from "@/components/action-form";
import { Badge, Card, Campo, Dl, PageHeader } from "@/components/ui";
import { EnviarAnexo, ListaAnexos } from "@/components/anexos";
import { PENDENCIA_TIPOS, PRIORIDADE_PENDENCIA, rotulo } from "@/lib/dominio";
import { fmtDataHora, fmtDia } from "@/lib/datas";
import { acaoAtribuir, acaoResolver } from "../actions";

export const metadata = { title: "Pendência" };
export default async function Pendencia({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCtx(); const { id } = await params;
  const { p, responsavelNome } = await obterPendencia(db, ctx, id);
  const anexos = await listarAnexos(db, ctx, "pendencia", id);
  const aberta = ["aberta", "em_andamento"].includes(p.situacao);
  const resolver = pode(ctx, "pendencia.resolver");
  const usuarios = resolver ? await db.select({ id: usuario.id, nome: usuario.nome }).from(usuario).where(and(eq(usuario.empresaId, ctx.empresaId), eq(usuario.ativo, true))) : [];
  const H = <input type="hidden" name="id" value={id} />;
  const link = p.osId ? `/os/${p.osId}` : p.veiculoId ? `/veiculos/${p.veiculoId}` : p.ferramentaId ? `/ferramentas/${p.ferramentaId}` : p.entidadeTipo === "material_divergencia" ? "/materiais/divergencias" : null;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader titulo={p.titulo} voltar={{ href: "/pendencias", rotulo: "Pendências" }} subtitulo={<span className="flex gap-2"><Badge tom={aberta ? "atencao" : "ok"}>{p.situacao}</Badge><Badge tom={p.prioridade === "critica" ? "critico" : "neutro"}>{rotulo(PRIORIDADE_PENDENCIA, p.prioridade)}</Badge></span>} />
      <Card>
        <Dl itens={[["Tipo", rotulo(PENDENCIA_TIPOS, p.tipo)], ["Aberta em", fmtDataHora(p.abertaEm)], ["Descrição", <span key="d" className="whitespace-pre-line">{p.descricao ?? "—"}</span>], ["Responsável", responsavelNome ?? "Sem responsável"], ["Prazo", p.prazo ? fmtDia(p.prazo) : "—"], ["Próxima ação", p.proximaAcao ?? "—"], ["Aguardando terceiro", p.aguardandoTerceiro ?? "—"], ["Liberação excepcional", p.liberacaoExcepcional ?? "—"], ["Resolução", p.resolucao ?? "—"]]} />
        {link && <Link href={link} className="btn btn-ghost mt-4">Abrir registro relacionado</Link>}
      </Card>
      <Card titulo="Evidências"><ListaAnexos anexos={anexos} /><div className="mt-2"><EnviarAnexo entidadeTipo="pendencia" entidadeId={id} /></div></Card>
      {aberta && resolver && (
        <>
          <Card titulo="Tratativa">
            <ActionForm action={acaoAtribuir} className="grid gap-3 sm:grid-cols-2">{H}
              <Campo rotulo="Responsável" nome="responsavelId"><select id="responsavelId" name="responsavelId" defaultValue={p.responsavelId ?? ""} className="select"><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Campo>
              <Campo rotulo="Prazo" nome="prazo"><input id="prazo" type="date" name="prazo" defaultValue={p.prazo ?? ""} className="input" /></Campo>
              <Campo rotulo="Prioridade" nome="prioridade"><select id="prioridade" name="prioridade" defaultValue={p.prioridade} className="select">{Object.entries(PRIORIDADE_PENDENCIA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
              <Campo rotulo="Próxima ação" nome="proximaAcao"><input id="proximaAcao" name="proximaAcao" defaultValue={p.proximaAcao ?? ""} className="input" /></Campo>
              <Campo rotulo="Aguardando terceiro (quem/condição)" nome="aguardandoTerceiro"><input id="aguardandoTerceiro" name="aguardandoTerceiro" defaultValue={p.aguardandoTerceiro ?? ""} className="input" /></Campo>
              {ctx.papeis.includes("gestor") && <Campo rotulo="Liberação excepcional (gestor)" nome="liberacao" dica="Ex.: veículo com irregularidade crítica liberado para uso"><input id="liberacao" name="liberacao" className="input" /></Campo>}
              <div className="sm:col-span-2"><Enviar>Salvar tratativa</Enviar></div>
            </ActionForm>
          </Card>
          <Card titulo="Encerrar">
            <ActionForm action={acaoResolver} className="flex flex-wrap gap-2">{H}<input name="resolucao" placeholder="O que foi feito (evidência da correção)" className="input flex-1" required /><Enviar className="btn btn-ok">Resolver</Enviar><Enviar className="btn btn-ghost" name="cancelar" value="1">Cancelar pendência</Enviar></ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}
