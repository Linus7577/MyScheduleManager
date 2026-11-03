import type { MetadataRoute } from "next";

// Browsers fetch the manifest without cookies, so it can't follow the language setting.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Schedule Manager",
    short_name: "Schedule",
    description: "Your week is a loop. Hold the line, or watch your armor fail.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
