import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Ride — Générateur de trajets moto",
  description:
    "Créez une sortie moto agréable selon la distance, le style de route et vos contraintes.",
  appleWebApp: {
    capable: true,
    title: "Ride",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#252525",
};
