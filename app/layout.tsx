// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Navbar from "@/components/navbar";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tester-ai.vercel.app";
const SITE_NAME = "Tester AI";
const SITE_DESCRIPTION =
  "Security Vulnerability Scanner, API Testing, dan Code Audit Engine bertenaga AI. Deteksi SQLi, XSS, IDOR, dan celah keamanan lainnya secara instan dengan skor CVSS dan rekomendasi perbaikan.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — AI Security Testing & Vulnerability Scanner`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "security scanner",
    "vulnerability scanner",
    "code audit",
    "AI security",
    "penetration testing",
    "CVSS",
    "SAST",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — AI Security Testing & Vulnerability Scanner`,
    description: SITE_DESCRIPTION,
    // NOTE: add this file under /public for the OG image to resolve.
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — AI Security Testing & Vulnerability Scanner`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // await is safe here whether headers() is sync (Next 14) or async
  // (Next 15+) — awaiting a non-Promise just resolves immediately.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          // Applies the saved theme before first paint to avoid a
          // light/dark flash. Toggled by components/navbar.tsx (Part 6),
          // same 'tester-ai-theme' localStorage key.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('tester-ai-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark');}else{d.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      <body
        className={`${inter.className} bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-screen antialiased transition-colors`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cyan-600 focus:text-white focus:rounded-lg"
        >
          Lewati ke konten utama
        </a>
        <Navbar />
        <div id="main-content">{children}</div>
        <Analytics />
      </body>
    </html>
  );
    }
