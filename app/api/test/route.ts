// app/api/test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callTesterAI, TesterAIError } from "@/lib/groq";

// --- Rate limiting ---------------------------------------------------------
// In-memory store: works per warm serverless instance, does not share state
// across regions/instances on Vercel. Swap for Upstash Redis / Vercel KV if
// cross-instance accuracy becomes important.
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetTime - now) / 1000)),
    };
  }

  record.count += 1;
  rateLimitStore.set(ip, record);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count, retryAfterSeconds: 0 };
}

function getClientIp(req: NextRequest): string {
  // x-forwarded-for may hold a comma-separated proxy chain; the first
  // entry is the original client.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "anonymous";
}

// --- CORS --------------------------------------------------------------------
// Set ALLOWED_ORIGINS (comma-separated) in production to restrict which
// origins may call this endpoint. Falls back to "*" when unset — safe here
// since the route uses no cookies/credentials.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  if (ALLOWED_ORIGINS.length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

// --- Input validation ----------------------------------------------------
const MAX_CODE_LENGTH = 50_000;
const VALID_TYPES = ["source_code", "api_endpoint", "prompt_template"] as const;
type ValidType = (typeof VALID_TYPES)[number];

function isValidType(value: unknown): value is ValidType {
  return typeof value === "string" && (VALID_TYPES as readonly string[]).includes(value);
}

function sanitizeCode(input: string): string {
  // Strip null bytes and trim surrounding whitespace. Report fields are
  // rendered as text (React escapes text nodes), so this is about hygiene
  // for the upstream LLM call, not XSS prevention.
  return input.replace(/\u0000/g, "").trim();
}

// ---------------------------------------------------------------------------

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = buildCorsHeaders(origin);

  try {
    const ip = getClientIp(req);
    const { allowed, remaining, retryAfterSeconds } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        {
          error: "Terlalu banyak permintaan. Silakan coba lagi sebentar lagi.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: {
            ...cors,
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body request bukan JSON yang valid.", code: "INVALID_JSON" },
        { status: 400, headers: cors }
      );
    }

    const { code, type } = (body ?? {}) as { code?: unknown; type?: unknown };

    if (!code || typeof code !== "string" || code.trim() === "") {
      return NextResponse.json(
        { error: "Parameter 'code' wajib diisi dan tidak boleh kosong.", code: "MISSING_CODE" },
        { status: 400, headers: cors }
      );
    }

    if (code.length > MAX_CODE_LENGTH) {
      return NextResponse.json(
        {
          error: `Kode terlalu panjang. Maksimal ${MAX_CODE_LENGTH.toLocaleString("id-ID")} karakter (saat ini ${code.length.toLocaleString("id-ID")}).`,
          code: "CODE_TOO_LONG",
        },
        { status: 413, headers: cors }
      );
    }

    if (!isValidType(type)) {
      return NextResponse.json(
        {
          error: "Parameter 'type' harus berupa source_code, api_endpoint, atau prompt_template.",
          code: "INVALID_TYPE",
        },
        { status: 400, headers: cors }
      );
    }

    const cleanCode = sanitizeCode(code);
    const scanResult = await callTesterAI(cleanCode, type);

    return NextResponse.json(scanResult, {
      status: 200,
      headers: {
        ...cors,
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (error: any) {
    // TesterAIError (added in lib/groq.ts, Part 2) carries its own
    // status/code for network, timeout, and upstream-parsing failures.
    if (error instanceof TesterAIError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: cors }
      );
    }

    console.error("Unhandled /api/test error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal pada server. Silakan coba lagi.", code: "INTERNAL_ERROR" },
      { status: 500, headers: cors }
    );
  }
    }
