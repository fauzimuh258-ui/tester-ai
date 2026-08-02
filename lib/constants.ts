// lib/constants.ts
//
// Central config shared by server code (app/api/test/route.ts, lib/groq.ts)
// and client components (code-scanner.tsx, api-tester.tsx). Because client
// components can import this file, nothing secret goes here — the Zey AI
// API key stays read directly from process.env inside lib/groq.ts and must
// never be re-exported from this file.

// --- Target types ------------------------------------------------------
export const VALID_TYPES = ["source_code", "api_endpoint", "prompt_template"] as const;
export type TargetType = (typeof VALID_TYPES)[number];

// --- Input limits --------------------------------------------------------
export const MAX_CODE_LENGTH = 50_000;

// --- Rate limiting (app/api/test/route.ts) ----------------------------
export const RATE_LIMIT = {
  WINDOW_MS: 60 * 1000,
  MAX_REQUESTS: 10,
} as const;

// --- Timeouts ------------------------------------------------------------
// CLIENT_REQUEST_TIMEOUT_MS must stay greater than GATEWAY_TIMEOUT_MS: the
// browser waits on the whole chain (route.ts -> Zey AI Gateway), so it
// needs enough headroom for the server's own timeout to fire first and
// return a proper error response instead of the client aborting early.
export const GATEWAY_TIMEOUT_MS = 45_000; // lib/groq.ts -> Zey AI Gateway
export const CLIENT_REQUEST_TIMEOUT_MS = 60_000; // browser -> /api/test

// --- AI Gateway (server-only values) --------------------------------------
// process.env.ZEY_AI_GATEWAY_URL / ALLOWED_ORIGINS are NOT prefixed with
// NEXT_PUBLIC_, so Next.js does not inline them into the client bundle —
// if a "use client" component ever imports these two, it will see the
// fallback / empty value below, not the real server env var. Both are
// currently only read server-side (lib/groq.ts, route.ts), which is safe.

export const ZEY_AI_GATEWAY_URL = process.env.ZEY_AI_GATEWAY_URL || "https://zey-ai.vercel.app/api/chat";

// Request shape sent to the gateway alongside { messages }. Field names
// (response_format) mirror the gateway's wire format so this can be
// spread directly into a fetch body: `{ messages, ...MODEL_CONFIG }`.
export const MODEL_CONFIG = {
  temperature: 0.1,
  response_format: { type: "json_object" },
} as const;

// --- CORS (app/api/test/route.ts) ---------------------------------------
// Comma-separated allow-list. Empty = reflect "*" (safe here since the
// route uses no cookies/credentials). Set in production to restrict origins.
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
