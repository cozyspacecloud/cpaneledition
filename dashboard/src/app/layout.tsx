import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COZYSPACECLOUD SORTER | cPanel Edition",
  description: "Advanced cPanel webmail identification tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
