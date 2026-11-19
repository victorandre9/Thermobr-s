import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Polar OS — Gestão de campo para climatização",
    short_name: "Polar OS",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#102238",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
