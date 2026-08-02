// __tests__/route.test.ts
//
// Tests app/api/test/route.ts directly (no HTTP server, no browser) by
// invoking the exported POST/OPTIONS handlers with a real NextRequest.
//
// Note: "Testing Library" (React Testing Library) renders and queries the
// DOM — it doesn't apply here since there's no component to render. Route
// Handlers are plain functions tested by calling them and asserting on the
// NextResponse they return. Jest alone (via next/jest) covers this; RTL
// becomes relevant once components (code-scanner.tsx etc.) get tests.

import { NextRequest } from "next/server";

jest.mock("@/lib/groq", () => {
  const actual = jest.requireActual("@/lib/groq");
  return {
    ...actual,
    callTesterAI: jest.fn(),
  };
});

import { POST, OPTIONS } from "@/app/api/test/route";
import { callTesterAI, TesterAIError } from "@/lib/groq";

const mockedCallTesterAI = callTesterAI as jest.Mock;

const VALID_SCAN_RESULT = {
  status: "success",
  timestamp: new Date().toISOString(),
  target_type: "source_code",
  summary: { total_vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, overall_risk_score: 0 },
  vulnerabilities: [],
  positive_security_practices: ["Uses parameterized queries"],
  markdown_report: "# Clean",
};

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

let ipCounter = 0;
// Each test gets its own IP so the in-memory rate limiter (keyed by IP)
// never leaks state between unrelated test cases.
function freshIp(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

describe("POST /api/test — input validation", () => {
  beforeEach(() => mockedCallTesterAI.mockReset());

  it("returns 400 when 'code' is missing", async () => {
    const res = await POST(buildRequest({ type: "source_code" }, { "x-forwarded-for": freshIp() }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("MISSING_CODE");
  });

  it("returns 400 when 'code' is empty/whitespace", async () => {
    const res = await POST(buildRequest({ code: "   ", type: "source_code" }, { "x-forwarded-for": freshIp() }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("MISSING_CODE");
  });

  it("returns 400 when 'type' is invalid", async () => {
    const res = await POST(
      buildRequest({ code: "const a = 1;", type: "not_a_real_type" }, { "x-forwarded-for": freshIp() })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_TYPE");
  });

  it("returns 413 when code exceeds the 50,000 character limit", async () => {
    const res = await POST(
      buildRequest({ code: "a".repeat(50_001), type: "source_code" }, { "x-forwarded-for": freshIp() })
    );
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("CODE_TOO_LONG");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: "{not valid json",
      headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp() },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_JSON");
  });

  it("does not call callTesterAI when validation fails", async () => {
    await POST(buildRequest({ code: "", type: "source_code" }, { "x-forwarded-for": freshIp() }));
    expect(mockedCallTesterAI).not.toHaveBeenCalled();
  });
});

describe("POST /api/test — success path", () => {
  beforeEach(() => mockedCallTesterAI.mockReset());

  it("returns 200 with the scan result on valid input", async () => {
    mockedCallTesterAI.mockResolvedValueOnce(VALID_SCAN_RESULT);

    const res = await POST(
      buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": freshIp() })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.total_vulnerabilities).toBe(0);
    expect(mockedCallTesterAI).toHaveBeenCalledWith("const a = 1;", "source_code");
  });

  it("trims surrounding whitespace before calling callTesterAI", async () => {
    mockedCallTesterAI.mockResolvedValueOnce(VALID_SCAN_RESULT);

    await POST(buildRequest({ code: "  const a = 1;  ", type: "source_code" }, { "x-forwarded-for": freshIp() }));

    expect(mockedCallTesterAI).toHaveBeenCalledWith("const a = 1;", "source_code");
  });

  it("includes X-RateLimit-Remaining on a successful response", async () => {
    mockedCallTesterAI.mockResolvedValueOnce(VALID_SCAN_RESULT);

    const res = await POST(
      buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": freshIp() })
    );

    expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
  });
});

describe("POST /api/test — upstream error handling", () => {
  beforeEach(() => mockedCallTesterAI.mockReset());

  it("maps a TesterAIError to its own status and code", async () => {
    mockedCallTesterAI.mockRejectedValueOnce(new TesterAIError("Gateway timed out", "GATEWAY_TIMEOUT", 504));

    const res = await POST(
      buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": freshIp() })
    );

    expect(res.status).toBe(504);
    expect((await res.json()).code).toBe("GATEWAY_TIMEOUT");
  });

  it("falls back to 500 INTERNAL_ERROR for an unexpected throw", async () => {
    mockedCallTesterAI.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": freshIp() })
    );

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/test — rate limiting", () => {
  beforeEach(() => mockedCallTesterAI.mockResolvedValue(VALID_SCAN_RESULT));

  it("allows the first 10 requests then blocks the 11th with 429 + Retry-After", async () => {
    const ip = freshIp();
    let lastRes;

    for (let i = 0; i < 11; i++) {
      lastRes = await POST(buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": ip }));
    }

    expect(lastRes!.status).toBe(429);
    expect((await lastRes!.json()).code).toBe("RATE_LIMIT_EXCEEDED");
    expect(Number(lastRes!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("tracks separate IPs independently", async () => {
    const ipA = freshIp();
    const ipB = freshIp();

    for (let i = 0; i < 10; i++) {
      await POST(buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": ipA }));
    }
    // ipA is now at its limit; ipB should be unaffected.
    const res = await POST(buildRequest({ code: "const a = 1;", type: "source_code" }, { "x-forwarded-for": ipB }));

    expect(res.status).toBe(200);
  });
});

describe("CORS", () => {
  beforeEach(() => mockedCallTesterAI.mockResolvedValue(VALID_SCAN_RESULT));

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "OPTIONS",
      headers: { origin: "https://example.com" },
    });

    const res = await OPTIONS(req);

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("defaults to Access-Control-Allow-Origin: * when ALLOWED_ORIGINS is unset", async () => {
    const res = await POST(
      buildRequest(
        { code: "const a = 1;", type: "source_code" },
        { "x-forwarded-for": freshIp(), origin: "https://anywhere.example.com" }
      )
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("reflects only an allow-listed origin when ALLOWED_ORIGINS is set", async () => {
    const originalEnv = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://allowed.example.com";
    jest.resetModules();

    // Re-require in dependency order so both modules share the same fresh
    // instance: configure groq's mock first, then load route.ts, which
    // internally requires the already-cached (configured) groq instance.
    const freshGroq = require("@/lib/groq");
    freshGroq.callTesterAI.mockResolvedValue(VALID_SCAN_RESULT);
    const freshRoute = require("@/app/api/test/route");

    const allowedRes = await freshRoute.POST(
      buildRequest(
        { code: "const a = 1;", type: "source_code" },
        { "x-forwarded-for": freshIp(), origin: "https://allowed.example.com" }
      )
    );
    const blockedRes = await freshRoute.POST(
      buildRequest(
        { code: "const a = 1;", type: "source_code" },
        { "x-forwarded-for": freshIp(), origin: "https://evil.example.com" }
      )
    );

    expect(allowedRes.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example.com");
    expect(blockedRes.headers.get("Access-Control-Allow-Origin")).toBeNull();

    process.env.ALLOWED_ORIGINS = originalEnv;
    jest.resetModules();
  });
});
