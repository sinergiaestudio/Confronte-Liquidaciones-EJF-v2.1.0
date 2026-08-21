import type { Metadata } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  metadataBase: new URL("https://confronte-liquidaciones-ejf.arielmarcelogomez7.chatgpt.site"),
  title: "Confronte de Liquidaciones EJF",
  description: "Control local, asistido y trazable de constancias de deuda y liquidaciones mandatarias.",
  manifest: "/manifest.webmanifest",
  applicationName: "Confronte EJF",
  appleWebApp: { capable: true, title: "Confronte EJF", statusBarStyle: "default" },
  openGraph: {
    title: "Confronte de Liquidaciones EJF",
    description: "Control documental y cálculo trazable, con procesamiento local de PDFs.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Confronte de Liquidaciones EJF",
    description: "Control documental y cálculo trazable, con procesamiento local de PDFs.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
