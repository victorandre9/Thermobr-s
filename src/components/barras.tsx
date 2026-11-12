/** Gráfico de barras horizontais simples (SVG/HTML), acessível, sem dados fictícios. */
export function Barras({ dados, formato = (v: number) => String(v), vazio = "Sem registros no período." }: { dados: Array<{ rotulo: string; valor: number; tom?: "navy" | "ice" | "ok" | "bad" | "warn" }>; formato?: (v: number) => string; vazio?: string }) {
  if (!dados.length || dados.every((d) => d.valor === 0)) return <p className="py-6 text-center text-[13px] text-muted">{vazio}</p>;
  const max = Math.max(...dados.map((d) => Math.abs(d.valor)));
  const cor = { navy: "bg-navy", ice: "bg-ice", ok: "bg-ok", bad: "bg-bad", warn: "bg-[#D98A00]" };
  return (
    <ul className="space-y-2.5">
      {dados.map((d) => (
        <li key={d.rotulo} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
          <span className="truncate text-text-2" title={d.rotulo}>{d.rotulo}</span>
          <span className="h-2.5 rounded-full bg-ice-faint"><span className={`block h-2.5 rounded-full ${cor[d.tom ?? "ice"]}`} style={{ width: `${Math.max(2, (Math.abs(d.valor) / max) * 100)}%` }} /></span>
          <span className="num font-semibold text-navy">{formato(d.valor)}</span>
        </li>
      ))}
    </ul>
  );
}
