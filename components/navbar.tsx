// components/navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const THEME_KEY = "tester-ai-theme";

export default function Navbar() {
  // Defaults to true to match the SSR-rendered "dark" class from
  // app/layout.tsx; corrected after mount by reading actual DOM state.
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
        >
          <div
            className="h-6 w-6 rounded bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center font-mono text-xs text-cyan-400 font-bold"
            aria-hidden="true"
          >
            T
          </div>
          <span className="font-bold text-slate-900 dark:text-white tracking-wider text-sm">TESTER AI</span>
        </Link>

        <nav
          className="flex items-center gap-2 sm:gap-3 text-xs font-medium text-slate-500 dark:text-slate-400"
          aria-label="Status dan pengaturan"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="hidden sm:inline">Engine Ready</span>
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600" aria-hidden="true">
            |
          </span>
          <span className="hidden sm:inline">v1.0.0</span>

          <button
            type="button"
            onClick={toggleTheme}
            disabled={!mounted}
            aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
            aria-pressed={isDark}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-cyan-500 hover:border-cyan-500/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:opacity-50"
          >
            {/* First paint always renders the moon icon (matches the
                default isDark=true) to avoid a hydration mismatch;
                corrected post-mount if the saved theme is light. */}
            {mounted && isDark ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
                                              }
