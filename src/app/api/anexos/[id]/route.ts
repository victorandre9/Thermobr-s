import { db } from "@/server/db";
import { obterCtx } from "@/server/auth/sessao";
import { obterAnexoAutorizado } from "@/server/services/anexos";
import { getStorage } from "@/server/storage";

/** Download autorizado (sem URL pública). Usuário desativado perde a sessão e, com ela, o acesso. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await obterCtx();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  try {
    const a = await obterAnexoAutorizado(db, ctx, id);
    const dados = await getStorage().ler(a.chaveStorage);
    return new Response(new Uint8Array(dados), { headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(a.nomeArquivo)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Acesso negado ou arquivo indisponível", { status: 403 });
  }
}
