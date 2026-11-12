/**
 * Quantidades de material com 3 casas decimais, aritmética em inteiros (milésimos) via BigInt.
 * Banco: numeric(14,3). Unidade sempre explícita no material.
 */
export const UNIDADES: Record<string, { nome: string; fracionavel: boolean }> = {
  un: { nome: "unidade", fracionavel: false },
  m: { nome: "metro", fracionavel: true },
  kg: { nome: "quilo", fracionavel: true },
  l: { nome: "litro", fracionavel: true },
  cx: { nome: "caixa", fracionavel: false },
  rolo: { nome: "rolo", fracionavel: false },
  par: { nome: "par", fracionavel: false },
};

export type Milli = bigint;

export function toMilli(v: string | number | null | undefined): Milli {
  if (v === null || v === undefined || v === "") return 0n;
  let s = String(v).trim().replace(",", ".");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Quantidade inválida: ${v}`);
  const [i, d = ""] = s.split(".");
  if (d.length > 3 && /[1-9]/.test(d.slice(3))) throw new Error("Máximo de 3 casas decimais");
  const m = BigInt(i) * 1000n + BigInt((d + "000").slice(0, 3));
  return neg ? -m : m;
}

export function fromMilli(m: Milli): string {
  const neg = m < 0n; const a = neg ? -m : m;
  const i = a / 1000n; const d = a % 1000n;
  return `${neg ? "-" : ""}${i}.${d.toString().padStart(3, "0")}`;
}

export function formatQtd(v: string | number | null | undefined, unidade?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  const m = toMilli(v);
  const neg = m < 0n; const a = neg ? -m : m;
  const i = a / 1000n; const d = a % 1000n;
  let s = i.toLocaleString("pt-BR");
  if (d !== 0n) s += "," + d.toString().padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${s}${unidade ? " " + unidade : ""}`;
}

export function parseQtdInput(v: string, unidade: string): string {
  const m = toMilli(v);
  if (m <= 0n) throw new Error("Quantidade deve ser maior que zero");
  const u = UNIDADES[unidade];
  if (u && !u.fracionavel && m % 1000n !== 0n) throw new Error(`Unidade "${unidade}" não aceita fração`);
  return fromMilli(m);
}

/** Valor (centavos) de preço unitário × quantidade decimal, arredondado ao centavo, sem float. */
export function valorItem(precoCentavos: number | null | undefined, quantidade: string | number): number {
  if (!precoCentavos) return 0;
  return Number((BigInt(precoCentavos) * toMilli(quantidade) + 500n) / 1000n);
}
