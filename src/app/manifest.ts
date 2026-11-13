import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thermobrás - Projeto de Gestão Integrada",
    short_name: "Thermobrás",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#102238",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
