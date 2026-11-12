"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Paperclip } from "lucide-react";

/** Envio de fotos/documentos para armazenamento privado. accept limita tipos; validação real no servidor. */
export function EnviarAnexo({ entidadeTipo, entidadeId, categoria = "foto", rotulo = "Adicionar foto", camera = true, onEnviado }: { entidadeTipo: string; entidadeId: string; categoria?: string; rotulo?: string; camera?: boolean; onEnviado?: (ids: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ carregando: boolean; erro?: string; ok?: string }>({ carregando: false });
  const router = useRouter();
  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setEstado({ carregando: true });
    const fd = new FormData();
    fd.set("entidadeTipo", entidadeTipo); fd.set("entidadeId", entidadeId); fd.set("categoria", categoria);
    for (const f of Array.from(files)) fd.append("arquivo", f);
    try {
      const r = await fetch("/api/anexos", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) setEstado({ carregando: false, erro: j.erro ?? "Falha no envio." });
      else { setEstado({ carregando: false, ok: `${j.ids.length} arquivo(s) enviado(s).` }); onEnviado?.(j.ids); router.refresh(); }
    } catch { setEstado({ carregando: false, erro: "Sem conexão. Tente novamente." }); }
    if (ref.current) ref.current.value = "";
  }
  return (
    <div>
      <input ref={ref} type="file" className="hidden" multiple accept={categoria === "foto" ? "image/jpeg,image/png,image/webp,image/heic" : "image/jpeg,image/png,application/pdf"} {...(camera && categoria === "foto" ? { capture: "environment" as const } : {})} onChange={(e) => enviar(e.target.files)} />
      <button type="button" className="btn btn-ghost" disabled={estado.carregando} onClick={() => ref.current?.click()}>
        {estado.carregando ? <Loader2 size={16} className="animate-spin" /> : categoria === "foto" ? <Camera size={16} /> : <Paperclip size={16} />}{estado.carregando ? "Enviando…" : rotulo}
      </button>
      {estado.erro && <p role="alert" className="mt-1 text-[12.5px] text-bad">{estado.erro}</p>}
      {estado.ok && <p role="status" className="mt-1 text-[12.5px] text-ok">{estado.ok}</p>}
    </div>
  );
}

export function ListaAnexos({ anexos }: { anexos: Array<{ id: string; nomeArquivo: string; mime: string }> }) {
  if (!anexos.length) return <p className="text-[12.5px] text-muted">Nenhum arquivo.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {anexos.map((a) => (
        <li key={a.id}>
          {a.mime.startsWith("image/") && a.mime !== "image/heic"
            // eslint-disable-next-line @next/next/no-img-element
            ? <a href={`/api/anexos/${a.id}`} target="_blank" rel="noreferrer"><img src={`/api/anexos/${a.id}`} alt={a.nomeArquivo} className="h-20 w-20 rounded-lg border border-line object-cover" loading="lazy" /></a>
            : <a href={`/api/anexos/${a.id}`} target="_blank" rel="noreferrer" className="chip"><Paperclip size={13} />{a.nomeArquivo}</a>}
        </li>
      ))}
    </ul>
  );
}
