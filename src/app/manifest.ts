import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Ishlar, loyihalar va eslatmalar bir joyda",
    lang: "uz",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // sharing a link or text (e.g. from Telegram) to Reja creates an inbox task
    share_target: {
      action: "/share-target",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Yangi vazifa", short_name: "Qoʻshish", url: "/?quickadd=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Kiruvchi", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
