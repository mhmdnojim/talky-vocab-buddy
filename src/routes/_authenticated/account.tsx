import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { useSubscription, getTierLimits } from "@/hooks/useSubscription";
import { useServerFn } from "@tanstack/react-start";
import {
  createCustomerPortalSession,
  cancelSubscriptionNow,
} from "@/utils/customer-portal.functions";
import { getPaddleEnvironment } from "@/lib/paddle";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/_authenticated/account")({
  ssr: false,
  head: () => ({ meta: [{ title: "Account — Speak Easy Words" }] }),
  component: AccountPage,
});

function AccountPage() {
  const sub = useSubscription();
  const portal = useServerFn(createCustomerPortalSession);
  const cancel = useServerFn(cancelSubscriptionNow);
  const [busy, setBusy] = useState<"portal" | "cancel" | null>(null);
  const limits = getTierLimits(sub.tier);

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { url } = await portal({ data: { environment: getPaddleEnvironment() } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert(err?.message ?? "Could not open portal");
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? Your premium access will end immediately.")) return;
    setBusy("cancel");
    try {
      await cancel({ data: { environment: getPaddleEnvironment() } });
    } catch (err: any) {
      alert(err?.message ?? "Could not cancel");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <header className="flex items-center gap-3 bg-primary px-4 py-4 text-primary-foreground shadow-md">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary-foreground/80"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Account</h1>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-8 pb-16 space-y-6">
        <section className="rounded-2xl border-2 border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Your plan</h2>
          {sub.loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-3xl font-bold capitalize text-foreground">{sub.tier}</span>
                {sub.status && sub.tier !== "free" && (
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {sub.status}
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>
                  Categories:{" "}
                  <span className="font-medium text-foreground">
                    {limits.categories === null ? "Unlimited" : limits.categories}
                  </span>
                </li>
                <li>
                  Words per patch:{" "}
                  <span className="font-medium text-foreground">{limits.wordsPerPatch}</span>
                </li>
                <li>
                  AI audio:{" "}
                  <span className="font-medium text-foreground">
                    {limits.aiAudio ? "Yes" : "No"}
                  </span>
                </li>
              </ul>
              {sub.currentPeriodEnd && sub.tier !== "free" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {sub.status === "canceled" ? "Access ends" : "Renews"}:{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-lg border-2 border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {sub.isActive ? "Change plan" : "Upgrade"}
            </Link>
            {sub.isActive && (
              <>
                <button
                  onClick={openPortal}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {busy === "portal" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Manage billing
                </button>
                {sub.status !== "canceled" && (
                  <button
                    onClick={handleCancel}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-destructive/40 bg-background px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {busy === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}
                    Cancel subscription
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
