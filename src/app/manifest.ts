import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Splatify - Paintball Days",
    short_name: "Splatify",
    description: "Find your crew and plan your next paintball day.",
    start_url: "/explore",
    scope: "/",
    display: "standalone",
    background_color: "#101210",
    theme_color: "#101210",
    icons: [
      {
        src: "/icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
