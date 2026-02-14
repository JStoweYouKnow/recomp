import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans, Syne } from "next/font/google";
import { AppWrapper } from "@/components/AppWrapper";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recomp | AI-Powered Diet & Workout Plans",
  description: "Personalized fitness and nutrition plans powered by Amazon Nova AI. Track calories, macros, and meals with dynamic plan adjustments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plusJakarta.variable} ${syne.variable} ${geistMono.variable} antialiased`}
      >
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
