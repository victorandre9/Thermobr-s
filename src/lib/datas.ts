/**
 * Datas e horários. Instantes ficam em UTC no banco (timestamptz) e são exibidos em America/Sao_Paulo.
 * Datas de calendário (vencimento, competência) são strings "YYYY-MM-DD" e nunca passam por fuso.
 */
export const TZ = "America/Sao_Paulo";

const dfData = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dfHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dfDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dfIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dfPartes = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

type Inst = Date | string | null | undefined;
const asDate = (v: Inst) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(v));

export const fmtData = (v: Inst) => { const d = asDate(v); return d ? dfData.format(d) : "—"; };
export const fmtHora = (v: Inst) => { const d = asDate(v); return d ? dfHora.format(d) : "—"; };
export const fmtDataHora = (v: Inst) => { const d = asDate(v); return d ? dfDataHora.format(d) : "—"; };

/** Formata data de calendário "YYYY-MM-DD" como dd/mm/aaaa sem conversão de fuso. */
export function fmtDia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function fmtCompetencia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

/** Data de hoje (calendário) em São Paulo. */
export function hojeSP(agora: Date = new Date()): string {
  return dfIso.format(agora);
}
/** Data de calendário (SP) de um instante. */
export function diaSP(v: Date | string): string {
  return dfIso.format(asDate(v)!);
}

/** Offset (minutos) de SP num instante. Brasil sem horário de verão desde 2019, mas calculado de forma genérica. */
function offsetMin(inst: Date): number {
  const p = Object.fromEntries(dfPartes.formatToParts(inst).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - inst.getTime()) / 60000);
}

/** Converte data "YYYY-MM-DD" + hora "HH:MM" (horário de SP) em instante UTC. */
export function instanteSP(dia: string, hora: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = offsetMin(guess);
  const inst = new Date(guess.getTime() - off * 60000);
  const off2 = offsetMin(inst);
  return off2 === off ? inst : new Date(guess.getTime() - off2 * 60000);
}

/** Início e fim (exclusivo) de um dia SP como instantes. */
export function intervaloDiaSP(dia: string): [Date, Date] {
  return [instanteSP(dia, "00:00"), instanteSP(somarDias(dia, 1), "00:00")];
}

export function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function diffDias(a: string, b: string): number {
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
/** 0=domingo..6=sábado para data de calendário. */
export function diaSemana(dia: string): number {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function inicioSemana(dia: string): string {
  const ds = diaSemana(dia);
  return somarDias(dia, ds === 0 ? -6 : 1 - ds); // segunda-feira
}
export function primeiroDiaMes(dia: string): string { return dia.slice(0, 7) + "-01"; }
export function somarMeses(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const tm = m - 1 + n;
  const ty = y + Math.floor(tm / 12);
  const mm = ((tm % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, mm + 1, 0)).getUTCDate();
  return `${ty}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export function diaDoMes(competencia: string, dia: number): string {
  const [y, m] = competencia.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dia, last)).padStart(2, "0")}`;
}
export function horaSP(v: Date | string): string {
  return fmtHora(v);
}
export const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
