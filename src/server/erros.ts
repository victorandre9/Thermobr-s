/** Erro de regra de negócio com mensagem acionável para o usuário. */
export class ErroNegocio extends Error {
  constructor(message: string, public campo?: string) { super(message); this.name = "ErroNegocio"; }
}
/** Acesso negado (escopo/permissão). Mensagem genérica para não revelar existência de registros. */
export class ErroAcesso extends Error {
  constructor(message = "Você não tem permissão para esta ação ou registro.") { super(message); this.name = "ErroAcesso"; }
}
export class ErroNaoEncontrado extends Error {
  constructor(message = "Registro não encontrado.") { super(message); this.name = "ErroNaoEncontrado"; }
}

/** Traduz violações do Postgres em mensagens de negócio. */
export function traduzirErroBanco(e: unknown): Error {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: unknown };
  const pg = (err && err.code ? err : (err?.cause as typeof err)) ?? err;
  const c = pg?.constraint ?? "";
  if (pg?.code === "23P01" && c.includes("agenda_reserva")) return new ErroNegocio("Conflito de agenda: um ou mais profissionais já estão reservados neste intervalo.");
  if (pg?.code === "23P01" && c.includes("recurso_veiculo")) return new ErroNegocio("Conflito de recurso: o veículo já está reservado para outra visita neste intervalo.");
  if (pg?.code === "23P01" && c.includes("recurso_ferramenta")) return new ErroNegocio("Conflito de recurso: a ferramenta exclusiva já está reservada para outra visita neste intervalo.");
  if (pg?.code === "23514" && c.includes("material_saldo")) return new ErroNegocio("Saldo insuficiente: a operação deixaria o estoque/custódia negativo ou abaixo do reservado.");
  if (pg?.code === "23505") {
    if (c.includes("obrigacao_chave")) return new ErroNegocio("Esta obrigação já foi gerada anteriormente (proteção contra duplicidade).");
    if (c.includes("ferr_mov_pendente")) return new ErroNegocio("Já existe uma movimentação pendente para esta ferramenta.");
    if (c.includes("usuario_email")) return new ErroNegocio("Já existe usuário com este e-mail.");
    if (c.includes("aprovacao_unica")) return new ErroNegocio("Você já registrou decisão para este item.");
    return new ErroNegocio("Registro duplicado: a operação já foi realizada.");
  }
  return e instanceof Error ? e : new Error(String(e));
}
