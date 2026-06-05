import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

export type Tier = "free" | "starter" | "pro";

export interface SubscriptionInfo {
  loading: boolean;
  tier: Tier;
  status: string | null;
  isActive: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string | null;
  customerId: string | null;
}

const TIER_LIMITS: Record<Tier, { categories: number | null; wordsPerPatch: number; aiAudio: boolean }> = {
  free: { categories: 3, wordsPerPatch: 20, aiAudio: false },
  starter: { categories: 25, wordsPerPatch: 50, aiAudio: true },
  pro: { categories: null, wordsPerPatch: 100, aiAudio: true },
};

export function getTierLimits(tier: Tier) {
  return TIER_LIMITS[tier];
}

function deriveTier(productId: string | null | undefined): Tier {
  if (productId === "pro_plan") return "pro";
  if (productId === "starter_plan") return "starter";
  return "free";
}

function isAccessActive(status: string, periodEnd: string | null): boolean {
  const future = !periodEnd || new Date(periodEnd) > new Date();
  if (status === "active" || status === "trialing" || status === "past_due") return future;
  if (status === "canceled") return !!periodEnd && new Date(periodEnd) > new Date();
  return false;
}

export function useSubscription(): SubscriptionInfo {
  const [state, setState] = useState<SubscriptionInfo>({
    loading: true,
    tier: "free",
    status: null,
    isActive: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    subscriptionId: null,
    customerId: null,
  });

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
        return;
      }
      const env = getPaddleEnvironment();
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setState({
          loading: false,
          tier: "free",
          status: null,
          isActive: false,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          subscriptionId: null,
          customerId: null,
        });
      } else {
        const active = isAccessActive(data.status as string, data.current_period_end as string | null);
        setState({
          loading: false,
          tier: active ? deriveTier(data.product_id as string) : "free",
          status: data.status as string,
          isActive: active,
          currentPeriodEnd: (data.current_period_end as string | null) ?? null,
          cancelAtPeriodEnd: !!data.cancel_at_period_end,
          subscriptionId: data.paddle_subscription_id as string,
          customerId: data.paddle_customer_id as string,
        });
      }

      if (!channel) {
        channel = supabase
          .channel(`subs-${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
            () => load(),
          )
          .subscribe();
      }
    }

    void load();
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load();
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
