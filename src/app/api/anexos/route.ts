import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { obterCtx, verificarOrigem } from "@/server/auth/sessao";
import { registrarAnexo, type EntidadeAnexo } from "@/server/services/anexos";
import { getStorage } from "@/server/storage";
import { ErroAcesso, ErroNegocio } from "@/server/erros";

/** Upload autorizado. Valida tipo/tamanho e a permissão sobre o registro de origem. */
export async function POST(req: Request) {
  const ctx = await obterCtx();
  if (!ctx) return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });
  try {
    await verificarOrigem();
    const fd = await req.formData();
    const arquivos = fd.getAll("arquivo").filter((f): f is File => f instanceof File && f.size > 0);
    if (!arquivos.length) throw new ErroNegocio("Selecione um arquivo.");
    const ids: string[] = [];
    for (const f of arquivos) {
      const buf = Buffer.from(await f.arrayBuffer());
      await db.transaction(async (tx) => {
        const a = await registrarAnexo(tx, ctx, { entidadeTipo: String(fd.get("entidadeTipo")) as EntidadeAnexo, entidadeId: String(fd.get("entidadeId")), categoria: String(fd.get("categoria") ?? "foto"), nomeArquivo: f.name || "arquivo", mime: f.type, tamanhoBytes: f.size });
        await getStorage().salvar(a.chaveStorage, buf, a.mime); // falha no storage desfaz o registro
        ids.push(a.id);
      });
    }
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    if (e instanceof ErroNegocio) return NextResponse.json({ erro: e.message }, { status: 400 });
    if (e instanceof ErroAcesso) return NextResponse.json({ erro: e.message }, { status: 403 });
    console.error("[anexo]", (e as Error).message);
    return NextResponse.json({ erro: "Falha ao enviar o arquivo. Tente novamente." }, { status: 500 });
  }
}
