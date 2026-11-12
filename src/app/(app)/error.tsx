"use client";
import Link from "next/link";
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const acesso = /permiss|acesso/i.test(error.message);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-lg font-bold text-navy">{acesso ? "Acesso não permitido" : "Algo deu errado"}</h1>
      <p className="mt-2 text-[13.5px] text-muted">{acesso ? "Você não tem permissão para este registro ou ação. Se precisar, peça ao gestor." : "Não foi possível carregar esta tela. Tente novamente. Se o problema continuar, informe o gestor com o horário do ocorrido."}</p>
      {error.digest && <p className="mt-2 text-[11px] text-muted">Código: {error.digest}</p>}
      <div className="mt-4 flex gap-2"><button className="btn btn-primary" onClick={reset}>Tentar novamente</button><Link className="btn btn-ghost" href="/">Ir ao início</Link></div>
    </div>
  );
}
