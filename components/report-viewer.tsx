// components/report-viewer.tsx
"use client";

import { memo, useCallback, useState } from "react";
import { ScanResult } from "@/lib/groq";

interface ReportViewerProps {
  data: ScanResult;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40",
  HIGH: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40",
  MEDIUM: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  LOW: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40",
};

function getSeverityBadgeClass(severity: string): string {
  return (
    SEVERITY_STYLES[severity.toUpperCase()] ||
    "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/40"
  );
}

type Vulnerability = ScanResult["vulnerabilities"][number];

interface VulnerabilityCardProps {
  vuln: Vulnerability;
  index: number;
  copyState: "idle" | "copied" | "error";
  onCopy: (code: string, index: number) => void;
}

// Extracted + memoized so a copy click only re-renders the one card whose
// copyState actually changed, not the whole findings list.
const VulnerabilityCard = memo(function VulnerabilityCard({
  vuln,
  index,
  copyState,
  onCopy,
}: VulnerabilityCardProps) {
  const copyLabel = copyState === "copied" ? "Copied!" : copyState === "error" ? "Gagal, coba lagi" : "Copy Fix";

  return (
    <article
      aria-label={`${vuln.severity}: ${vuln.title}`}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 text-xs font-semibold rounded border ${getSeverityBadgeClass(vuln.severity)}`}
          >
            {vuln.severity}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{vuln.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            CVSS: <strong className="text-slate-900 dark:text-white">{vuln.cvss_score}</strong>
          </span>
          <span>{vuln.cwe_id}</span>
        </div>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        <strong className="text-slate-700 dark:text-slate-300">Lokasi:</strong> {vuln.location}
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300">{vuln.description}</p>

      <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
        <strong className="text-slate-700 dark:text-slate-300">Dampak:</strong> {vuln.impact}
      </div>

      {vuln.code_fix && (
        <div className="relative">
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-t text-xs text-slate-500 dark:text-slate-400">
            <span>Rekomendasi Perbaikan Code</span>
            <button
              type="button"
              onClick={() => onCopy(vuln.code_fix, index)}
              aria-label={`Salin kode perbaikan untuk ${vuln.title}`}
              className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded px-1"
            >
              {copyLabel}
            </button>
          </div>
          <pre className="p-3 bg-slate-100 dark:bg-black/50 border border-t-0 border-slate-200 dark:border-slate-800 rounded-b text-xs font-mono text-emerald-700 dark:text-emerald-400 overflow-x-auto">
            {vuln.code_fix}
          </pre>
        </div>
      )}
    </article>
  );
});

function ReportViewer({ data }: ReportViewerProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorIndex, setErrorIndex] = useState<number | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const handleCopy = useCallback(async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      setErrorIndex(null);
      setLiveMessage("Kode perbaikan disalin ke clipboard.");
      setTimeout(() => {
        setCopiedIndex((current) => (current === index ? null : current));
      }, 2000);
    } catch {
      setErrorIndex(index);
      setCopiedIndex(null);
      setLiveMessage("Gagal menyalin kode. Coba salin secara manual.");
      setTimeout(() => {
        setErrorIndex((current) => (current === index ? null : current));
      }, 2000);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Single shared live region announces copy result for all cards. */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      <div
        role="group"
        aria-label="Ringkasan hasil pemindaian"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">{data.summary.total_vulnerabilities}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/40 rounded-lg p-3 text-center">
          <div className="text-xs text-red-600 dark:text-red-400">Critical</div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{data.summary.critical}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-900/40 rounded-lg p-3 text-center">
          <div className="text-xs text-orange-600 dark:text-orange-400">High</div>
          <div className="text-xl font-bold text-orange-600 dark:text-orange-400">{data.summary.high}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-yellow-200 dark:border-yellow-900/40 rounded-lg p-3 text-center">
          <div className="text-xs text-yellow-700 dark:text-yellow-400">Medium</div>
          <div className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{data.summary.medium}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/40 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-600 dark:text-blue-400">Low</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{data.summary.low}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 dark:text-slate-400">Risk Score</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {data.summary.overall_risk_score}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Temuan Kerentanan</h3>
        {data.vulnerabilities.length === 0 ? (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm">
            Tidak ditemukan kerentanan keamanan pada kode ini.
          </div>
        ) : (
          data.vulnerabilities.map((vuln, idx) => (
            <VulnerabilityCard
              key={vuln.id || idx}
              vuln={vuln}
              index={idx}
              copyState={copiedIndex === idx ? "copied" : errorIndex === idx ? "error" : "idle"}
              onCopy={handleCopy}
            />
          ))
        )}
      </div>

      {data.positive_security_practices && data.positive_security_practices.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Praktik Keamanan Baik</h3>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg">
            {data.positive_security_practices.map((practice, idx) => (
              <li key={idx}>{practice}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default memo(ReportViewer);
