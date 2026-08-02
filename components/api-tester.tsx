// components/api-tester.tsx
"use client";

import { useCallback, useId, useRef, useState } from "react";
import ReportViewer from "./report-viewer";
import { ScanResult } from "@/lib/groq";

const REQUEST_TIMEOUT_MS = 60_000;
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

const HEADERS_PLACEHOLDER = `{
  "Content-Type": "application/json",
  "Authorization": "Bearer <token>"
}`;

const BODY_PLACEHOLDER = `{
  "user_id": "1001"
}`;

// --- Loading skeleton --------------------------------------------------
// Local copy (not shared with code-scanner.tsx) to keep this file
// self-contained — same visual shape as ReportViewer's real layout.
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Belum ada hasil pengujian</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
        Isi endpoint, method, headers, dan body di atas, lalu klik &quot;Test API Security&quot; untuk menganalisis
        konfigurasi API.
      </p>
    </div>
  );
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidJsonOrEmpty(value: string): boolean {
  if (!value.trim()) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export default function ApiTester() {
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<(typeof HTTP_METHODS)[number]>("POST");
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const endpointId = useId();
  const methodId = useId();
  const headersId = useId();
  const bodyId = useId();
  const errorId = useId();

  const handleTestApi = useCallback(async () => {
    const trimmedEndpoint = endpoint.trim();

    if (!trimmedEndpoint) {
      setError("Endpoint URL tidak boleh kosong.");
      return;
    }
    if (!isValidUrl(trimmedEndpoint)) {
      setError("Endpoint URL tidak valid. Sertakan skema, contoh: https://api.example.com/v1/resource");
      return;
    }
    if (!isValidJsonOrEmpty(headers)) {
      setError("Headers harus berupa JSON yang valid, atau dikosongkan.");
      return;
    }
    if (!isValidJsonOrEmpty(body)) {
      setError("Request body harus berupa JSON yang valid, atau dikosongkan.");
      return;
    }

    setLoading(true);
    setError(null);

    const apiSpec = `ENDPOINT: ${method} ${trimmedEndpoint}\nHEADERS:\n${headers.trim() || "(none)"}\nBODY:\n${
      body.trim() || "(none)"
    }`;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: apiSpec, type: "api_endpoint" }),
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
        throw new Error(data.error || "Gagal menguji API.");
      }

      setResult(data);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("Permintaan melebihi batas waktu. Coba lagi dengan payload yang lebih sederhana.");
      } else if (err instanceof TypeError) {
        setError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
      } else {
        setError(err.message || "Terjadi kesalahan tak terduga saat menguji API.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [endpoint, method, headers, body]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="sm:w-32">
            <label htmlFor={methodId} className="sr-only">
              HTTP Method
            </label>
            <select
              id={methodId}
              value={method}
              onChange={(e) => setMethod(e.target.value as (typeof HTTP_METHODS)[number])}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-700 dark:text-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor={endpointId} className="sr-only">
              Endpoint URL
            </label>
            <input
              id={endpointId}
              type="url"
              inputMode="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/v1/user/profile"
              aria-describedby={error ? errorId : undefined}
              aria-required="true"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor={headersId} className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Headers (JSON, opsional)
            </label>
            <textarea
              id={headersId}
              rows={5}
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder={HEADERS_PLACEHOLDER}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            />
          </div>
          <div>
            <label htmlFor={bodyId} className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
              Request Body (JSON, opsional)
            </label>
            <textarea
              id={bodyId}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={BODY_PLACEHOLDER}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            />
          </div>
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
          onClick={handleTestApi}
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
              Analisis Keamanan API...
            </span>
          ) : (
            "Test API Security"
          )}
        </button>
      </div>

      <div aria-live="polite">
        {loading ? (
          <>
            <span className="sr-only">Menganalisis API, mohon tunggu...</span>
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
