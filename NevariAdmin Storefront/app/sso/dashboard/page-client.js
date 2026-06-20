"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildTwoStepVerificationRequest, loadAuthSecuritySettings } from "../../components/auth-security-settings";
import { FRONTEND_BY_TYPE } from "../../components/frontend-config";
import { buildUrl, defaultSession, frontendContext } from "../../components/role-session";

export default function DashboardSsoPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Connecting your dashboard...");

  const frontendType = String(searchParams.get("frontend") || "").trim();
  const config = useMemo(() => FRONTEND_BY_TYPE[frontendType] || null, [frontendType]);
  const transactionId = String(searchParams.get("transaction") || "").trim();
  const state = String(searchParams.get("state") || "").trim();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!config || !transactionId || !state) {
        setMessage("This sign-in link is invalid.");
        return;
      }

      const session = defaultSession(config);
      const authSecuritySettings = loadAuthSecuritySettings();

      try {
        const response = await fetch(buildUrl(session, "/sso/dashboard/exchange"), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Nevari-Frontend-Type": session.frontendType,
            "X-Nevari-Frontend-Origin": window.location.origin
          },
          body: JSON.stringify({
            transaction_id: transactionId,
            state,
            ...frontendContext(session),
            ...buildTwoStepVerificationRequest(authSecuritySettings)
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success || !payload?.data?.verification_required) {
          throw new Error(payload?.error?.message || "We could not start your dashboard session.");
        }

        const next = payload.data.return_path || config.dashboardPath;
        const url = new URL(config.loginPath, window.location.origin);
        url.searchParams.set("challenge_id", payload.data.challenge_id || "");
        url.searchParams.set("masked_email", payload.data.masked_email || "");
        url.searchParams.set("sso_transaction_id", payload.data.sso_transaction_id || transactionId);
        url.searchParams.set("next", next);

        if (!cancelled) {
          router.replace(url.pathname + url.search);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(String(error?.message || "We could not start your dashboard session."));
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [config, router, state, transactionId]);

  return (
    <main className="auth-gate auth-gate-sso">
      <div className="auth-gate-shell auth-gate-shell-sso">
        <section className="auth-card auth-screen-card auth-screen-card-sso">
          <div className="auth-card-body auth-card-body-sso">
            <h1 className="auth-title">Secure sign-in</h1>
            <p className="auth-subtitle">{message}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
