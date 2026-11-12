/** Cristal de gelo (floco de neve) decorativo — desenho geométrico próprio, usado como marca d'água do fundo. */
export function Gelo({ className }: { className?: string }) {
  const braco = (
    <g>
      <line x1="0" y1="0" x2="0" y2="-92" />
      <polyline points="-16,-70 0,-54 16,-70" />
      <polyline points="-22,-88 0,-72 22,-88" />
      <line x1="0" y1="-38" x2="-14" y2="-46" />
      <line x1="0" y1="-38" x2="14" y2="-46" />
    </g>
  );
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      {[0, 60, 120, 180, 240, 300].map((a) => <g key={a} transform={`rotate(${a})`}>{braco}</g>)}
      <polygon points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8" />
    </svg>
  );
}

export function FundoGelo() {
  return (
    <div className="app-bg" aria-hidden="true">
      <Gelo className="gelo g1" />
      <Gelo className="gelo g2" />
    </div>
  );
}
