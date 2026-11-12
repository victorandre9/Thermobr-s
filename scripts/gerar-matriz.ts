/** Gera docs/ACESSOS.md a partir da matriz real do código (fonte única). */
import { writeFileSync } from "node:fs";
import { PERMISSOES, PAPEIS_PADRAO } from "../src/server/auth/permissoes";
const cab = `| Permissão | ${PAPEIS_PADRAO.map((p) => p.nome + (p.ativo ? "" : " (desativado)")).join(" | ")} |\n|---|${PAPEIS_PADRAO.map(() => ":-:").join("|")}|`;
const linhas = Object.entries(PERMISSOES).map(([k, v]) => `| ${v} \`${k}\` | ${PAPEIS_PADRAO.map((p) => { const e = p.grants[k as keyof typeof PERMISSOES]; return e === "empresa" ? "Empresa" : e === "proprio" ? "Próprio" : "—"; }).join(" | ")} |`);
const doc = `# Matriz de acessos

Gerado por \`npx tsx scripts/gerar-matriz.ts\` a partir de \`src/server/auth/permissoes.ts\` (fonte única). Não edite à mão.

- **Empresa**: todos os registros da empresa. **Próprio**: apenas registros ligados ao próprio profissional (visitas em que participa, custódias, valores próprios).
- A checagem é feita nos serviços do servidor (consultas, ações, anexos, exportações, contadores e notificações). Esconder botões é complementar.
- Um usuário pode acumular papéis; concessões individuais explícitas ficam registradas na auditoria. Ninguém altera os próprios papéis/permissões.

## Regras que não dependem só da matriz

| Regra | Onde |
|---|---|
| Vínculo profissional (autônomo × equipe própria) é atributo separado das permissões | \`profissional.vinculo\` |
| Autônomo nunca executa checklist de veículo, mesmo com permissão concedida | \`podeChecklistVeiculo\` |
| Técnico próprio só faz checklist do veículo designado; troca de responsável exige nova conferência | \`veiculos.ts\` |
| Equipe própria não gera pagamento por OS | \`agenda.ts\` (linha só para autônomos) |
| Ninguém confirma/aprova pagamento a si mesmo (exceto gestor, com autoaprovação registrada) | \`financeiro.ts\` |
| Quem informou movimento/divergência não confere nem aprova o próprio | \`materiais.ts\`, \`pendencias.ts\` |
| Somente o responsável da visita inicia e encerra; demais registram participação própria | \`execucao.ts\` |
| Dupla aprovação opcional por categoria/valor (definida pelos donos) | \`categoria_financeira\` |
| Categorias restritas (salários, retiradas) exigem \`financeiro.restrito.ver\` | \`financeiro.ts\`, \`fluxo.ts\` |
| Conta demo é recusada em produção (login e sessão) | \`autenticacao.ts\`, \`contexto.ts\` |
| Usuário desativado perde sessões e, com elas, o acesso a anexos | \`usuarios.ts\` |

## Matriz por papel padrão

${cab}
${linhas.join("\n")}

## Papéis padrão

${PAPEIS_PADRAO.map((p) => `- **${p.nome}** (\`${p.codigo}\`)${p.ativo ? "" : " — desativado inicialmente"}: ${p.descricao}`).join("\n")}
`;
writeFileSync("docs/ACESSOS.md", doc);
console.log("docs/ACESSOS.md gerado");
