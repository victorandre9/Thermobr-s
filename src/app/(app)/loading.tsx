export default function Carregando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-ice-soft" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-24 animate-pulse" />)}</div>
      <div className="card h-64 animate-pulse" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
