import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FundoGelo } from "@/components/gelo";

export const metadata: Metadata = {
  title: { default: "Thermobrás - Projeto de Gestão Integrada", template: "%s · Thermobrás" },
  description: "Thermobrás Ar Condicionado — ordens de serviço, agenda, ativos, materiais e financeiro em um só lugar.",
  applicationName: "Thermobrás - Projeto de Gestão Integrada",
  appleWebApp: { title: "Thermobrás", capable: true, statusBarStyle: "default" },
  openGraph: { title: "Thermobrás - Projeto de Gestão Integrada", description: "Ordens de serviço, agenda, ativos, materiais e financeiro em um só lugar.", siteName: "Thermobrás", locale: "pt_BR", type: "website" },
  twitter: { card: "summary_large_image", title: "Thermobrás - Projeto de Gestão Integrada" },
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
