import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asisten Finansial Percakapan (Simulasi)",
  description: "Prototipe Asisten Finansial Percakapan untuk Penelitian Keputusan Keuangan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
