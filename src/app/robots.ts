import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://gtnh.samiracle.fr/sitemap.xml",
    host: "https://gtnh.samiracle.fr",
  };
}
