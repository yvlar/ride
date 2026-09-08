import { Geist, Geist_Mono } from "next/font/google";
import { NativeChrome } from "@/components/native/native-chrome";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import { MapThemeProvider } from "@/components/theme/map-theme-provider";
import { DEFAULT_MAP_THEME } from "@/domain/map/map-theme";
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
      data-map-theme={DEFAULT_MAP_THEME}
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <AppearanceProvider>
          <MapThemeProvider>
            <NativeChrome />
            {children}
          </MapThemeProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
