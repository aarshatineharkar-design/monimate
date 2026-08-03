import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoniMate — Financial Life RPG",
  description: "Learn to manage money by living through it. A financial literacy game for young adults in New Zealand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ background: '#1a1a2e', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
