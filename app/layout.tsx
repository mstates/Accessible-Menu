import type { Metadata } from "next";
import { en } from "@/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: en.site.name,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={en.lang}>
      <body className="min-h-screen bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-3 focus:underline"
        >
          {en.skipLink}
        </a>
        {children}
      </body>
    </html>
  );
}
