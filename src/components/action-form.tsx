"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, OctagonAlert } from "lucide-react";

export type EstadoAcao = { ok: boolean; erro?: string; msg?: string; redirecionar?: string; nonce?: number } | null;
type Acao = (estado: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

function novaChave() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2); }

/**
 * Formulário ligado a server action. Inclui chave de idempotência por envio (_idem): toques repetidos não duplicam.
 * Mostra estados de envio, sucesso e erro acionável. Confirmação opcional antes de enviar.
 */
export function ActionForm({ action, children, className, confirmar, resetar = false, mostrarSucesso = true }: { action: Acao; children: ReactNode; className?: string; confirmar?: string; resetar?: boolean; mostrarSucesso?: boolean }) {
  const [estado, formAction] = useActionState(action, null);
  const [idem, setIdem] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => { setIdem(novaChave()); }, [estado]);
  useEffect(() => {
    if (estado?.ok) {
      if (resetar) ref.current?.reset();
      if (estado.redirecionar) router.push(estado.redirecionar);
    }
  }, [estado, resetar, router]);
  return (
    <form ref={ref} action={formAction} className={className} onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
      <input type="hidden" name="_idem" value={idem} />
      {children}
      {estado && !estado.ok && estado.erro && (
        <div role="alert" className="mt-3 flex gap-2 rounded-lg border border-[#F2C4C4] bg-bad-soft px-3 py-2 text-[13px] text-bad"><OctagonAlert size={16} className="mt-0.5 shrink-0" />{estado.erro}</div>
      )}
      {estado?.ok && mostrarSucesso && estado.msg && (
        <div role="status" className="mt-3 flex gap-2 rounded-lg border border-[#BFE5D1] bg-ok-soft px-3 py-2 text-[13px] text-ok"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{estado.msg}</div>
      )}
    </form>
  );
}

export function Enviar({ children, className = "btn btn-primary", pendente = "Salvando…", name, value }: { children: ReactNode; className?: string; pendente?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} aria-busy={pending}>
      {pending ? <><Loader2 size={16} className="animate-spin" aria-hidden />{pendente}</> : children}
    </button>
  );
}
