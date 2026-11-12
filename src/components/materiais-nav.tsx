import { ChipLink, Filtros } from "./ui";
export function MateriaisNav({ ativo }: { ativo: string }) {
  const L: Array<[string, string]> = [["/materiais", "Estoque e cadastro"], ["/materiais/conferencia", "Conferência"], ["/materiais/divergencias", "Divergências"], ["/materiais/custodias", "Custódias e saldos"], ["/materiais/compras", "Compras"]];
  return <Filtros>{L.map(([h, r]) => <ChipLink key={h} href={h} ativo={ativo === h}>{r}</ChipLink>)}</Filtros>;
}
