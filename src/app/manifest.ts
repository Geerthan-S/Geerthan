import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal OS",
    short_name: "Personal OS",
    description: "A calm, work-first operating system.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1318",
    theme_color: "#11151b",
  };
}
