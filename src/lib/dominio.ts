/** Rótulos e enumerações de domínio compartilhados entre servidor e interface. */
export const OS_ETAPAS = {
  aberta: "Aberta",
  em_planejamento: "Em planejamento",
  aguardando_material: "Aguardando material",
  pronta_para_atendimento: "Pronta para atendimento",
  em_atendimento: "Em atendimento",
  pendente_retorno: "Pendente de retorno",
  servico_concluido: "Serviço concluído — conferência pendente",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
} as const;
export type OsEtapa = keyof typeof OS_ETAPAS;

export const OS_ORIGENS = { avulso: "Serviço avulso aprovado", contrato: "Visita de contrato", retorno_garantia: "Retorno / garantia" } as const;
export const PRIORIDADES = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" } as const;
export const SITUACAO_COMERCIAL = { rascunho: "Rascunho", aprovada: "Aprovada", cancelada: "Cancelada" } as const;
export const SITUACAO_MATERIAL = { nao_avaliado: "Não avaliado", sem_necessidade: "Sem necessidade", pendente: "Material pendente", disponivel: "Material disponível" } as const;
export const SITUACAO_CONFERENCIA = { nao_aplicavel: "—", pendente: "Conferência pendente", conferida: "Conferida" } as const;

export const VISITA_SITUACOES = { nao_agendada: "Não agendada", agendada: "Agendada", em_atendimento: "Em atendimento", finalizada: "Finalizada", cancelada: "Cancelada" } as const;
export const VISITA_RESULTADOS = { concluida: "Concluída", parcial: "Parcialmente concluída", nao_realizada: "Não realizada" } as const;
export const MOTIVOS_RESULTADO = {
  falta_material: "Falta de material",
  peca_divergente: "Peça divergente",
  ausencia_cliente: "Ausência do cliente",
  falta_acesso: "Falta de acesso",
  defeito_adicional: "Defeito adicional",
  outro: "Outro",
} as const;
export const TESTE_FUNCIONAMENTO = { ok: "Funcionando", falhou: "Falhou", nao_testado: "Não testado" } as const;

export const FERRAMENTA_SITUACOES = {
  disponivel: "Disponível", reservada: "Reservada", aguardando_confirmacao: "Aguardando confirmação", em_custodia: "Em custódia",
  devolucao_pendente: "Devolução pendente de conferência", no_cliente: "Deixada no cliente", extraviada: "Extraviada", baixada: "Baixada",
} as const;
export const FERRAMENTA_CONDICOES = { boa: "Boa", desgastada: "Desgastada", danificada: "Danificada", em_manutencao: "Em manutenção", baixada: "Baixada" } as const;

export const PENDENCIA_TIPOS = {
  visita_impedimento: "Impedimento em visita", solicitacao_retorno: "Solicitação de retorno", solicitacao_remarcacao: "Solicitação de remarcação",
  extra_solicitado: "Extra solicitado", material_necessario: "Necessidade de material", ferramenta_falta: "Falta de ferramenta",
  ferramenta_dano: "Ferramenta danificada", ferramenta_no_cliente: "Ferramenta deixada no cliente", veiculo_irregularidade: "Irregularidade de veículo",
  veiculo_sem_designacao: "Técnico próprio sem veículo designado", material_divergencia: "Divergência de material", os_sem_responsavel: "OS sem responsável", outro: "Outra",
} as const;
export const PRIORIDADE_PENDENCIA = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" } as const;

export const MATERIAL_MOV_TIPOS = {
  entrada_compra: "Entrada (compra)", entrega: "Entrega", transferencia: "Transferência", consumo: "Consumo", devolucao: "Devolução",
  perda: "Perda", ajuste: "Ajuste", segregacao: "Segregação", liberacao_segregado: "Liberação de segregado",
} as const;
export const MATERIAL_MOV_STATUS = { informado: "Informado (aguarda conferência)", em_transito: "Aguardando confirmação do recebedor", confirmado: "Confirmado", recusado: "Recusado", cancelado: "Cancelado" } as const;

export const OBRIGACAO_APROVACAO = { rascunho: "Rascunho", aguardando_aprovacao: "Aguardando aprovação", aprovada: "Aprovada", rejeitada: "Rejeitada", cancelada: "Cancelada" } as const;
export const BAIXA_STATUS = { aguardando_conferencia: "Aguardando conferência", confirmada: "Confirmada", rejeitada: "Rejeitada" } as const;
export const AUTONOMO_SITUACAO = { aguardando_valor: "Aguardando valor", aguardando_conferencia: "Aguardando conferência", conferido: "Conferido", liberado: "Liberado", pago: "Pago", cancelado: "Cancelado" } as const;
export const VINCULOS = { autonomo: "Técnico autônomo", proprio: "Equipe própria (Thermobrás)" } as const;
export const UNIDADE_LABEL: Record<string, string> = { un: "un", m: "m", kg: "kg", l: "L", cx: "cx", rolo: "rolo", par: "par" };

export function rotulo<T extends Record<string, string>>(mapa: T, k: string | null | undefined): string {
  if (!k) return "—";
  return (mapa as Record<string, string>)[k] ?? k;
}
