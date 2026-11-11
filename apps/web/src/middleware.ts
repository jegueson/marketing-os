import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "./lib/csp";

/**
 * Per-request CSP. Next.js reads the nonce from the request CSP header and
 * applies it to framework scripts. Set CSP_REPORT_ONLY=1 to downgrade to
 * Content-Security-Policy-Report-Only without changing the policy text.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const https = request.nextUrl.protocol === "https:";
  const policy = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https,
    connectUrls: [process.env.NEXT_PUBLIC_API_BASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const headerName =
    process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  response.headers.set(headerName, policy);
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
