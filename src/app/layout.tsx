import { Geist, Geist_Mono } from "next/font/google";
import { NativeChrome } from "@/components/native/native-chrome";
import { metadata, viewport } from "./document-chrome";
import "./globals.css";

export { metadata, viewport };

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <NativeChrome />
        {children}
      </body>
    </html>
  );
}
