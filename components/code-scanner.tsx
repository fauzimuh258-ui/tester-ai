// components/code-scanner.tsx
"use client";

import { useCallback, useId, useRef, useState } from "react";
import ReportViewer from "./report-viewer";
import { ScanResult } from "@/lib/groq";

const REQUEST_TIMEOUT_MS = 60_000;

// --- Loading skeleton --------------------------------------------------
// Mirrors ReportViewer's layout (summary cards + finding cards) so the
// swap from skeleton to real content doesn't jump around.
function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-40 rounded bg-slate-100 dark:bg-slate-900" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          />
        ))}
      </div>
    </div>
  );
}

// --- Empty state -----------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
      <div
        className="h-12 w-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-6 w-6 text-cyan-500"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Belum ada hasil pemindaian</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
        Tempelkan kode, konfigurasi API, atau prompt template di atas, lalu klik &quot;Scan Security&quot; untuk
        memulai analisis kerentanan.
      </p>
    </div>
  );
}

export default function CodeScanner() {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"source_code" | "api_endpoint" | "prompt_template">("source_code");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const textareaId = useId();
  const selectId = useId();
  const errorId = useId();

  const handleScan = useCallback(async () => {
    if (!code.trim()) {
      setError("Input kode tidak boleh kosong.");
      return;
    }

    setLoading(true);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, type }),
        signal: controller.signal,
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server mengembalikan respons yang tidak valid.");
      }

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          throw new Error(
            data.error || `Terlalu banyak permintaan.${retryAfter ? ` Coba lagi dalam ${retryAfter} detik.` : ""}`
          );
        }
        throw new Error(data.error || "Gagal melakukan pemindaian.");
      }

      setResult(data);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("Permintaan melebihi batas waktu. Coba lagi dengan kode yang lebih pendek.");
      } else if (err instanceof TypeError) {
        setError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
      } else {
        setError(err.message || "Terjadi kesalahan tak terduga saat memproses request.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [code, type]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <label htmlFor={selectId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Target Type:
          </label>
          <select
            id={selectId}
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <option value="source_code">Source Code (Static Audit)</option>
            <option value="api_endpoint">API Endpoint Configuration</option>
            <option value="prompt_template">LLM Prompt Template</option>
          </select>
        </div>

        <div>
          <label htmlFor={textareaId} className="sr-only">
            Kode, prompt, atau spesifikasi API untuk diuji
          </label>
          <textarea
            id={textareaId}
            rows={10}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Tempelkan kode, prompt, atau spesifikasi API di sini untuk diuji..."
            aria-describedby={error ? errorId : undefined}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={loading}
          aria-busy={loading}
          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Memindai Kerentanan...
            </span>
          ) : (
            "Scan Security"
          )}
        </button>
      </div>

      <div aria-live="polite">
        {loading ? (
          <>
            <span className="sr-only">Memindai kerentanan, mohon tunggu...</span>
            <ReportSkeleton />
          </>
        ) : result ? (
          <ReportViewer data={result} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
