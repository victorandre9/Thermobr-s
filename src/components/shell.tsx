"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Home, Calendar, Wrench, Package, Truck, Wallet, AlertTriangle, Inbox, ClipboardList, Map, Users, FileText, ArrowDownCircle, ArrowUpCircle,
  CheckSquare, LineChart, Phone, BarChart3, Settings, Bell, Menu, X, LogOut, type LucideIcon,
} from "lucide-react";
import type { ItemNav } from "@/lib/nav";
import { ASSINATURA } from "@/lib/marca";

const ICONES: Record<string, LucideIcon> = { home: Home, calendar: Calendar, wrench: Wrench, package: Package, truck: Truck, wallet: Wallet, alert: AlertTriangle, inbox: Inbox, clipboard: ClipboardList, map: Map, users: Users, file: FileText, arrowDown: ArrowDownCircle, arrowUp: ArrowUpCircle, check: CheckSquare, chart: LineChart, phone: Phone, report: BarChart3, settings: Settings };

function ativo(path: string, href: string) { return href === "/" ? path === "/" : path === href || path.startsWith(href + "/"); }

function Lista({ itens, path, onNav }: { itens: ItemNav[]; path: string; onNav?: () => void }) {
  const grupos = [...new Set(itens.map((i) => i.grupo))];
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5">
      {grupos.map((g) => (
        <div key={g || "_"} className="mb-2">
          {g && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</div>}
          {itens.filter((i) => i.grupo === g).map((i) => {
            const I = ICONES[i.icone] ?? Home; const a = ativo(path, i.href);
            return (
              <Link key={i.href} href={i.href} onClick={onNav} aria-current={a ? "page" : undefined}
                className="nav-item">
                <span className="nic"><I size={17} aria-hidden /></span>{i.rotulo}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Shell({ itens, tecnico, usuario, papel, naoLidas, marca, sair, demo = false, children }: { itens: ItemNav[]; tecnico: boolean; usuario: string; papel: string; naoLidas: number; marca: ReactNode; sair: (fd: FormData) => void; demo?: boolean; children: ReactNode }) {
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  const inferior = tecnico ? itens.slice(0, 4) : [];
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="glass-bar sticky top-0 hidden h-screen flex-col !rounded-none !border-y-0 !border-l-0 px-3 py-4 lg:flex">
        <Link href="/" className="mb-4 border-b border-line px-2 pb-4">{marca}</Link>
        <div className="flex-1 overflow-y-auto"><Lista itens={itens} path={path} /></div>
        <div className="mt-3 border-t border-line px-2 pt-3">
          <div className="truncate text-[13px] font-semibold text-navy">{usuario}</div>
          <div className="truncate text-[12px] text-muted">{papel}</div>
          <div className="mt-2 flex gap-2">
            <Link href="/conta" className="btn btn-ghost btn-sm">Minha conta</Link>
            <form action={sair}><button className="btn btn-ghost btn-sm" type="submit"><LogOut size={14} aria-hidden />Sair</button></form>
          </div>
          <div className="mt-3 text-[10.5px] text-muted">{ASSINATURA}</div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/90 bg-white/70 px-4 py-2.5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <button className="btn btn-ghost btn-sm" onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={18} /></button>
            <Link href="/">{marca}</Link>
          </div>
          <div className="hidden text-[13px] text-muted lg:block">Olá, <span className="font-semibold text-navy">{usuario.split(" ")[0]}</span></div>
          <div className="flex items-center gap-2">
          {demo && <form action={sair}><button type="submit" className="btn btn-ice btn-sm" title="Voltar à escolha de usuário (demonstração)"><Users size={15} aria-hidden /><span className="hidden sm:inline">Trocar usuário</span><span className="sm:hidden">Trocar</span></button></form>}
          <Link href="/notificacoes" className="relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-2 hover:bg-ice-faint" aria-label={`Notificações: ${naoLidas} não lidas`}>
            <Bell size={18} aria-hidden /><span className="hidden sm:inline">Notificações</span>
            {naoLidas > 0 && <span className="num rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{naoLidas > 99 ? "99+" : naoLidas}</span>}
          </Link>
          </div>
        </header>
        <main className={`mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-8 lg:py-7 ${tecnico ? "pb-28 lg:pb-7" : ""}`}>{children}</main>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setAberto(false)} />
          <div className="glass-bar absolute inset-y-0 left-0 flex w-[84%] max-w-[320px] flex-col !rounded-r-[28px] px-3 py-4">
            <div className="mb-3 flex items-center justify-between px-2"><span>{marca}</span><button className="btn btn-ghost btn-sm" onClick={() => setAberto(false)} aria-label="Fechar menu"><X size={18} /></button></div>
            <div className="flex-1 overflow-y-auto"><Lista itens={itens} path={path} onNav={() => setAberto(false)} /></div>
            <div className="border-t border-line px-2 pt-3">
              <div className="text-[13px] font-semibold text-navy">{usuario}</div><div className="text-[12px] text-muted">{papel}</div>
              <div className="mt-2 flex gap-2"><Link href="/conta" onClick={() => setAberto(false)} className="btn btn-ghost btn-sm">Minha conta</Link><form action={sair}><button className="btn btn-ghost btn-sm" type="submit">Sair</button></form></div>
              <div className="mt-3 text-[10.5px] text-muted">{ASSINATURA}</div>
            </div>
          </div>
        </div>
      )}

      {tecnico && (
        <nav aria-label="Navegação rápida" className="glass-bar fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 gap-1 rounded-full p-1.5 lg:hidden">
          {inferior.map((i) => { const I = ICONES[i.icone] ?? Home; const a = ativo(path, i.href); return (
            <Link key={i.href} href={i.href} aria-current={a ? "page" : undefined} className="bn-item"><I size={20} aria-hidden />{(() => { const r = i.rotulo.replace("Minhas ", "").replace("Minha ", ""); return r.charAt(0).toUpperCase() + r.slice(1); })()}</Link>
          ); })}
          <button onClick={() => setAberto(true)} className="bn-item"><Menu size={20} aria-hidden />Mais</button>
        </nav>
      )}
    </div>
  );
}
