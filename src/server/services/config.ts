import { eq } from "drizzle-orm";
import type { DBOrTx } from "../db";
import { empresa } from "../db/schema";

export interface ConfigEmpresa {
  autonomos: { diaSemanaPrevisaoPagamento: number }; // 5 = sexta
  materiais: { prazoCustodiaDias: number };
  ferramentas: { prazoDevolucaoDias: number };
  veiculos: { checklistSaidaObrigatorio: boolean; checklistRetornoObrigatorio: boolean; bloquearComIrregularidadeCritica: boolean; alertaAntecedenciaKm: number; alertaAntecedenciaDias: number };
  financeiro: { prazoProjecaoPadraoDias: number };
  agenda: { duracaoPadraoMin: number };
}

export const CONFIG_PADRAO: ConfigEmpresa = {
  autonomos: { diaSemanaPrevisaoPagamento: 5 },
  materiais: { prazoCustodiaDias: 15 },
  ferramentas: { prazoDevolucaoDias: 7 },
  veiculos: { checklistSaidaObrigatorio: true, checklistRetornoObrigatorio: false, bloquearComIrregularidadeCritica: true, alertaAntecedenciaKm: 1000, alertaAntecedenciaDias: 15 },
  financeiro: { prazoProjecaoPadraoDias: 30 },
  agenda: { duracaoPadraoMin: 240 },
};

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

export async function obterConfig(dbx: DBOrTx, empresaId: string): Promise<ConfigEmpresa> {
  const [e] = await dbx.select({ config: empresa.config }).from(empresa).where(eq(empresa.id, empresaId));
  return merge(CONFIG_PADRAO, e?.config);
}
