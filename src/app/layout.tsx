import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYOS — Your personal space",
  description: "A quiet home for your thoughts, decisions, and personal history.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
