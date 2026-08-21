import type { Metadata } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { publicPath } from "../lib/domain/public-path";

const githubOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "sinergiaestudio";
const metadataBase = process.env.GITHUB_PAGES === "true"
  ? new URL(`https://${githubOwner}.github.io/`)
  : new URL("https://confronte-liquidaciones-ejf.arielmarcelogomez7.chatgpt.site");

export const metadata: Metadata = {
  metadataBase,
  title: "Confronte de Liquidaciones EJF",
  description: "Control local, asistido y trazable de constancias de deuda y liquidaciones mandatarias.",
  manifest: publicPath("/manifest.webmanifest"),
  applicationName: "Confronte EJF",
  appleWebApp: { capable: true, title: "Confronte EJF", statusBarStyle: "default" },
  openGraph: {
    title: "Confronte de Liquidaciones EJF",
    description: "Control documental y cálculo trazable, con procesamiento local de PDFs.",
    images: [publicPath("/app-icon.svg")],
  },
  twitter: {
    card: "summary_large_image",
    title: "Confronte de Liquidaciones EJF",
    description: "Control documental y cálculo trazable, con procesamiento local de PDFs.",
    images: [publicPath("/app-icon.svg")],
  },
  icons: {
    icon: publicPath("/favicon.svg"),
    shortcut: publicPath("/favicon.svg"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
