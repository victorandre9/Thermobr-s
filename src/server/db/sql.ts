import { getTableName, sql, type Column } from "drizzle-orm";

/** Referência qualificada "tabela"."coluna" — necessária em subconsultas dentro do SELECT (Drizzle não qualifica em consultas sem join). */
export const qc = (c: Column) => sql.raw(`"${getTableName(c.table)}"."${c.name}"`);
