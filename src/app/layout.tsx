import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Header } from "@/components/Header";
import { ClientToaster } from "@/components/ClientToaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tijeen.trade · memecoin trading simulator",
  description: "Practice trading Solana memecoins in a realistic simulation. No real money.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <Header />
        </Suspense>
        <main className="flex flex-1 flex-col">{children}</main>
        <ClientToaster />
      </body>
    </html>
  );
}
