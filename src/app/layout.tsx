import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "./Analytics";
import { AnalyticsHeartbeat } from "./AnalyticsHeartbeat";
import "./globals.css";

const monocraft = localFont({
  src: [
    { path: "./fonts/Monocraft-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "./fonts/Monocraft-Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/Monocraft.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Monocraft-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Monocraft-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Monocraft-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-minecraft",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gtnh.samiracle.fr"),
  applicationName: "GTNH Planner",
  title: "GTNH Planner | GregTech New Horizons Factory Calculator",
  description:
    "Plan and optimize GregTech: New Horizons factories with a GTNH recipe flowchart, throughput calculator, machine ratios, and dataset-backed production chains.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  keywords: [
    "GTNH Planner",
    "GregTech New Horizons planner",
    "GTNH factory planner",
    "GTNH recipe calculator",
    "GTNH throughput calculator",
    "GregTech factory calculator",
  ],
  openGraph: {
    title: "GTNH Planner | GregTech New Horizons Factory Calculator",
    description:
      "Build GTNH recipe flowcharts, calculate throughput, balance machine ratios, and plan production chains for GregTech: New Horizons.",
    siteName: "GTNH Planner",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "GTNH Planner | GregTech New Horizons Factory Calculator",
    description:
      "Build GTNH recipe flowcharts, calculate throughput, balance machine ratios, and plan production chains for GregTech: New Horizons.",
  },
  icons: {
    icon: "/site-icon.png",
    shortcut: "/site-icon.png",
    apple: "/site-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${monocraft.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <script
          // Apply the persisted (or system) theme before paint to avoid a flash.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('gtnh-factory-flow.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        {children}
        <Analytics />
        <AnalyticsHeartbeat />
      </body>
    </html>
  );
}
