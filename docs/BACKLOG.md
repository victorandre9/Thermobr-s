# Backlog de evolução (fora desta entrega)

Itens registrados sem implementação. Cada um precisa de estimativa e decisão de escopo dos donos.

| Item | Observações para estimativa |
|---|---|
| QR Code em ferramentas e equipamentos | Leitura pela câmera (ex.: `@zxing/browser`, licença Apache-2.0 — verificar versão). Etiquetas físicas. |
| Programação automática de preventivas e renovações de contrato | Hoje: OS de contrato manual + mensalidade automática. Exige regra de periodicidade por contrato/equipamento. |
| Portal do cliente | Acesso externo restrito a OS, relatórios e cobranças do próprio cliente; nova fronteira de autenticação. |
| Notificações push | Exige service worker, consentimento e provedor (Web Push / FCM). Hoje: notificações internas. |
| Funcionamento offline completo | Fila local de check-in/fichas/fotos com reconciliação; conflitos de concorrência. Primeira versão é online. |
| IA para relatórios e análise de pendências | Resumos e priorização assistidos; definir dados permitidos e revisão humana. |
| Integração bancária (extrato/PIX/boletos) | Conciliação automática; exige contrato com banco/PSP e credenciais. Hoje: registro manual de fatos. |
| Automação de WhatsApp | Envio de relatórios/cobranças; exige provedor oficial (API Business) e consentimento. Hoje: download para envio manual. |
| Agenda com arrastar-e-soltar | Avaliado FullCalendar (Standard MIT; recursos "Premium" como resource timeline têm licença paga). Não adotado: agenda própria atende sem custo. |
| Testes E2E automatizados no CI | Script Playwright usado na validação manual; transformar em suíte `@playwright/test` no CI. |
