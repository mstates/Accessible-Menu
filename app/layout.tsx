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
      <body>{children}</body>
    </html>
  );
}
