// lib/groq.ts
import { TESTER_AI_PROMPT } from "./system-prompt";

export interface ScanResult {
  status: string;
  timestamp: string;
  target_type: "source_code" | "api_endpoint" | "prompt_template";
  summary: {
    total_vulnerabilities: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    overall_risk_score: number;
  };
  vulnerabilities: Array<{
    id: string;
    title: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
    cvss_score: number;
    cwe_id: string;
    location: string;
    description: string;
    impact: string;
    poc_concept: string;
    remediation: string;
    code_fix: string;
  }>;
  positive_security_practices: string[];
  markdown_report: string;
}

// Structured error so route.ts can map failures to the right HTTP status
// and a user-facing (Indonesian) message without string-matching.
export class TesterAIError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 502) {
    super(message);
    this.name = "TesterAIError";
    this.code = code;
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 45_000;

export async function callTesterAI(
  code: string,
  type: "source_code" | "api_endpoint" | "prompt_template"
): Promise<ScanResult> {
  const gatewayUrl = process.env.ZEY_AI_GATEWAY_URL || "https://zey-ai.vercel.app/api/chat";

  const payload = {
    messages: [
      { role: "system", content: TESTER_AI_PROMPT },
      {
        role: "user",
        content: `Tipe Target: ${type}\n\nKode/Input untuk diuji:\n\`\`\`\n${code}\n\`\`\``,
      },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ZEY_AI_API_KEY && {
          Authorization: `Bearer ${process.env.ZEY_AI_API_KEY}`,
        }),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new TesterAIError(
        "Permintaan ke AI Gateway melebihi batas waktu. Coba lagi dengan kode yang lebih pendek.",
        "GATEWAY_TIMEOUT",
        504
      );
    }
    throw new TesterAIError(
      "Tidak dapat terhubung ke AI Gateway. Periksa koneksi jaringan server.",
      "NETWORK_ERROR",
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorDetail = "";
    try {
      errorDetail = await response.text();
    } catch {
      // Body already consumed or unreadable — fall back to statusText.
    }
    throw new TesterAIError(
      `AI Gateway mengembalikan error [${response.status}]: ${errorDetail || response.statusText}`,
      "GATEWAY_ERROR",
      response.status >= 500 ? 502 : response.status
    );
  }

  let rawData: any;
  try {
    rawData = await response.json();
  } catch {
    throw new TesterAIError(
      "Respons dari AI Gateway bukan JSON yang valid.",
      "INVALID_GATEWAY_RESPONSE",
      502
    );
  }

  const content = rawData.choices?.[0]?.message?.content ?? rawData.content ?? rawData;

  let parsed: ScanResult;
  if (typeof content === "string") {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new TesterAIError(
        "Gagal mengekstrak struktur JSON dari respons AI.",
        "PARSE_ERROR",
        502
      );
    }
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new TesterAIError(
        "Respons AI mengandung JSON yang tidak valid.",
        "PARSE_ERROR",
        502
      );
    }
  } else if (content && typeof content === "object") {
    parsed = content as ScanResult;
  } else {
    throw new TesterAIError("Format respons AI tidak dikenali.", "PARSE_ERROR", 502);
  }

  // Minimal shape check so a malformed AI response fails loudly here
  // instead of crashing deep inside ReportViewer.
  if (!parsed.summary || !Array.isArray(parsed.vulnerabilities)) {
    throw new TesterAIError("Struktur hasil scan tidak lengkap.", "SCHEMA_ERROR", 502);
  }

  return parsed;
  }
