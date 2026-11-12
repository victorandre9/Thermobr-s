/** Dinheiro em centavos inteiros. Nunca usar float para somas. */
const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return fmt.format(centavos / 100);
}

/** Converte "1.234,56" | "1234.56" | "1234,5" | "R$ 10" em centavos inteiros sem passar por float. */
export function parseBRL(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [int, dec = ""] = s.split(".");
  const v = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  return neg ? -v : v;
}

export function centavosParaInput(c: number | null | undefined): string {
  if (c === null || c === undefined) return "";
  const neg = c < 0; const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

export function somaCentavos(vals: Array<number | null | undefined>): number {
  let t = 0;
  for (const v of vals) if (v) t += v;
  return t;
}

/** Divide um total em n parcelas inteiras; o resto vai para a primeira. */
export function dividirParcelas(total: number, n: number): number[] {
  if (n < 1) throw new Error("n inválido");
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? resto : 0));
}
