import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FundoGelo } from "@/components/gelo";

export const metadata: Metadata = {
  title: { default: "Polar OS — Gestão de campo para climatização", template: "%s · Polar OS" },
  description: "Gestão integrada para empresas de ar-condicionado: pedidos, ordens de serviço, agenda e produtividade dos técnicos, materiais, ferramentas, veículos e financeiro.",
  applicationName: "Polar OS",
  appleWebApp: { title: "Polar OS", capable: true, statusBarStyle: "default" },
  openGraph: { title: "Polar OS — Gestão de campo para climatização", description: "Do pedido ao pagamento: O.S., agenda e produtividade dos técnicos, materiais, ferramentas, veículos e financeiro em um só lugar.", siteName: "Polar OS", locale: "pt_BR", type: "website" },
  twitter: { card: "summary_large_image", title: "Polar OS — Gestão de campo para climatização" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#102238", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <FundoGelo />
        {children}
      </body>
    </html>
  );
}
