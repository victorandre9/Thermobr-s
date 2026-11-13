"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const CLS = "btn btn-ghost btn-sm mb-2 !gap-1.5 !pl-2.5";

/** Botão Voltar presente em todas as telas. Com destino fixo vira link; sem destino volta à tela anterior (ou ao Início). */
export function Voltar({ href, rotulo }: { href?: string; rotulo?: string }) {
  const router = useRouter();
  if (href) return <Link href={href} className={CLS}><ArrowLeft size={15} />{rotulo ?? "Voltar"}</Link>;
  return (
    <button type="button" className={CLS} onClick={() => {
      const mesmaOrigem = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
      if (mesmaOrigem && window.history.length > 1) router.back(); else router.push("/");
    }}><ArrowLeft size={15} />Voltar</button>
  );
}
