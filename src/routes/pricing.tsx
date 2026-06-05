import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription, type Tier } from "@/hooks/useSubscription";
import { useServerFn } from "@tanstack/react-start";
import { changeSubscriptionPlan } from "@/utils/customer-portal.functions";
import { getPaddleEnvironment } from "@/lib/paddle";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pricing — Speak Easy Words" },
      {
        name: "description",
        content:
          "Pick a plan: Free, Starter, or Pro. Unlock more categories, AI audio, and larger word patches.",
      },
      { property: "og:title", content: "Pricing — Speak Easy Words" },
      { property: "og:description", content: "Plans for every learner." },
    ],
  }),
  component: PricingPage,
});

type BillingCycle = "monthly" | "yearly";

const PLANS: Array<{
  tier: Tier;
  name: string;
  blurb: string;
  monthly: { priceId: string | null; amount: string; savings?: string };
  yearly: { priceId: string | null; amount: string; savings?: string };
  features: string[];
}> = [
  {
    tier: "free",
    name: "Free",
    blurb: "Get started, no card needed.",
    monthly: { priceId: null, amount: "$0" },
    yearly: { priceId: null, amount: "$0" },
    features: ["3 custom categories", "Up to 20 words per patch", "Images & example sentences"],
  },
  {
    tier: "starter",
    name: "Starter",
    blurb: "For serious learners.",
    monthly: { priceId: "starter_monthly", amount: "$5" },
    yearly: { priceId: "starter_yearly", amount: "$50", savings: "Save $10" },
    features: ["25 custom categories", "Up to 50 words per patch", "AI audio pronunciation", "Everything in Free"],
  },
  {
    tier: "pro",
    name: "Pro",
    blurb: "Unlimited learning.",
    monthly: { priceId: "pro_monthly", amount: "$15" },
    yearly: { priceId: "pro_yearly", amount: "$150", savings: "Save $30" },
    features: [
      "Unlimited custom categories",
      "Up to 100 words per patch",
      "AI audio pronunciation",
      "Priority support",
    ],
  },
];

function PricingPage() {
  const navigate = useNavigate();
  const sub = useSubscription();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const changePlan = useServerFn(changeSubscriptionPlan);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
    });
  }, []);

  const handleSelect = async (priceId: string | null, tier: Tier) => {
    if (!priceId) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    setBusyPlan(priceId);
    try {
      if (sub.isActive && sub.subscriptionId) {
        // Switch tier — immediate, pro-rated
        await changePlan({
          data: { environment: getPaddleEnvironment(), newPriceId: priceId },
        });
      } else {
        await openCheckout({
          priceId,
          customerEmail: user.email,
          customData: { userId: user.id },
          successUrl: `${window.location.origin}/?checkout=success`,
        });
      }
    } catch (err: any) {
      alert(err?.message ?? "Something went wrong");
    } finally {
      setBusyPlan(null);
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
        <h1 className="text-lg font-semibold">Pricing</h1>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground">Pick a plan</h2>
          <p className="mt-2 text-muted-foreground">
            Learn more words, faster. Cancel any time.
          </p>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full bg-muted p-1">
            <button
              onClick={() => setCycle("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const choice = cycle === "monthly" ? plan.monthly : plan.yearly;
            const isCurrent = sub.tier === plan.tier && sub.isActive;
            const isFree = plan.tier === "free";
            const busy = busyPlan === choice.priceId || (checkoutLoading && busyPlan === choice.priceId);

            return (
              <div
                key={plan.tier}
                className={`flex flex-col rounded-2xl border-2 bg-card p-6 ${
                  plan.tier === "pro" ? "border-primary shadow-lg" : "border-border"
                }`}
              >
                {plan.tier === "pro" && (
                  <div className="mb-2 inline-flex w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{choice.amount}</span>
                  {!isFree && (
                    <span className="text-sm text-muted-foreground">
                      /{cycle === "monthly" ? "mo" : "yr"}
                    </span>
                  )}
                </div>
                {cycle === "yearly" && choice.savings && (
                  <p className="mt-1 text-xs font-medium text-green-600">{choice.savings}</p>
                )}

                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(choice.priceId, plan.tier)}
                  disabled={isCurrent || isFree || busy || sub.loading}
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    plan.tier === "pro"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-2 border-border bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCurrent
                    ? "Current plan"
                    : isFree
                    ? "Free forever"
                    : sub.isActive
                    ? "Switch to this plan"
                    : "Get " + plan.name}
                </button>
              </div>
            );
          })}
        </div>

        {user && (
          <div className="mt-8 text-center text-sm">
            <Link to="/account" className="text-primary underline">
              Manage your subscription
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
