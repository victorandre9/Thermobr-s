import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FundoGelo } from "@/components/gelo";

export const metadata: Metadata = {
  title: { default: "Thermobrás", template: "%s · Thermobrás" },
  description: "Gestão operacional e financeira da Thermobrás — OS, agenda, ativos, materiais e financeiro operacional.",
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
