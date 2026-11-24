@AGENTS.md

# Thermobrás — notas para o Claude

O Victor não é desenvolvedor: fale em português simples.

## Blocos (leia SÓ o documento e a pasta do assunto da tarefa)

| Assunto | Documento | Código |
|---|---|---|
| Plano e checklist do projeto | `docs/PLANO.md` | — |
| Perfis e permissões | `docs/ACESSOS.md` | `src/server/services/escopo.ts`, `autenticacao.ts` |
| Fluxos (OS, pedidos, visitas…) | `docs/FLUXOS.md` | `src/server/services/os.ts`, `pedidos.ts`, `fluxo.ts` |
| Operação do dia a dia | `docs/OPERACAO.md` | `src/app/(app)/agenda`, `checklist-hoje`, `pendencias` |
| Pendências futuras | `docs/BACKLOG.md` | — |
| Telas | — | `src/app/(app)/<área>` (clientes, contratos, os, pedidos, financeiro, materiais, ferramentas, veículos, relatórios…) |
| Regras e escrita | — | `src/server/services/<área>.ts` (sempre pelo serviço, com `Ctx`) |

## Mapa do código (Graphify)

Antes de abrir arquivos para achar onde algo mora, consulte o mapa (montado sem custo de tokens no início da sessão):
`graphify query "assunto"`, `graphify explain "Função"` ou `graphify-out/GRAPH_REPORT.md`. Depois de mudar código: `graphify update .`

## Economia de publicações (Vercel)

`vercel.json` → `ignoreCommand`: mudança só em `CLAUDE.md`/`AGENTS.md`/`docs/` não gera publicação (o plano gratuito tem limite diário).
