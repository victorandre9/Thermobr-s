import { NextResponse, type NextRequest } from "next/server";

/** Redirecionamento otimista para /login sem cookie. A verificação real da sessão ocorre no servidor (exigirCtx). */
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const publico = p.startsWith("/login") || p.startsWith("/redefinir-senha") || p.startsWith("/api/integracoes/") || p.startsWith("/api/saude") || p.startsWith("/brand/") || p.startsWith("/_next") || p === "/favicon.ico";
  if (!publico && !req.cookies.get("tb_sessao")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
