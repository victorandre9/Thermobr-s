import { Badge, type Tom } from "./ui";
import { OS_ETAPAS, VISITA_SITUACOES, VISITA_RESULTADOS, PRIORIDADES, rotulo } from "@/lib/dominio";

const TOM_ETAPA: Record<string, Tom> = { aberta: "neutro", em_planejamento: "info", aguardando_material: "atencao", pronta_para_atendimento: "info", em_atendimento: "info", pendente_retorno: "alerta", servico_concluido: "atencao", encerrada: "ok", cancelada: "neutro" };
export const EtapaOS = ({ e }: { e: string }) => <Badge tom={TOM_ETAPA[e] ?? "neutro"}>{rotulo(OS_ETAPAS, e)}</Badge>;
export const SituacaoVisita = ({ s, r }: { s: string; r?: string | null }) =>
  s === "finalizada" ? <Badge tom={r === "concluida" ? "ok" : r === "parcial" ? "atencao" : "critico"}>{rotulo(VISITA_RESULTADOS, r)}</Badge>
    : <Badge tom={s === "em_atendimento" ? "info" : s === "cancelada" ? "neutro" : s === "nao_agendada" ? "atencao" : "neutro"}>{rotulo(VISITA_SITUACOES, s)}</Badge>;
export const Prioridade = ({ p }: { p: string }) => p === "normal" || p === "baixa" ? <span className="text-[12.5px] text-muted">{rotulo(PRIORIDADES, p)}</span> : <Badge tom={p === "urgente" ? "critico" : "alerta"}>{rotulo(PRIORIDADES, p)}</Badge>;
