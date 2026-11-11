import Script from "next/script";
import { headers } from "next/headers";
import { GetStartedForm } from "./form";

/** Server page so the Turnstile script can carry the per-request CSP nonce. */
export default async function GetStartedPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <>
      {siteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          nonce={nonce}
        />
      ) : null}
      <GetStartedForm {...(siteKey ? { siteKey } : {})} />
    </>
  );
}
