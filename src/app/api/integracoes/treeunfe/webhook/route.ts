/**
 * Webhook de pedidos Treeunfe — NÃO ATIVO.
 * A existência de API/webhook de pedidos não foi confirmada na documentação oficial do produto contratado.
 * Enquanto não houver validação, recusa todas as chamadas (sem processar payloads nem simular sucesso).
 */
export async function POST() {
  return Response.json({ erro: "Integração de pedidos Treeunfe aguardando validação da documentação oficial. Webhook não habilitado." }, { status: 503 });
}
