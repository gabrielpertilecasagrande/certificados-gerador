import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estúdio de Certificados",
  description: "Ferramenta interna para criação e geração de certificados em massa",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f6f7f9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full min-h-full">
        {children}
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
