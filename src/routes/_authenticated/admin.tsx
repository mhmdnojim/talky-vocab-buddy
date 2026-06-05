import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Shield, ShieldOff, Trash2, Plus, KeyRound, RefreshCw } from "lucide-react";
import {
  adminCheckAccess,
  adminListUsers,
  adminUpdateSubscription,
  adminDeleteSubscription,
  adminGrantSubscription,
  adminDeleteUser,
  adminSetUserRole,
  adminResetUserPassword,
} from "@/lib/admin.functions";
import { getPaddleEnvironment } from "@/lib/paddle";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Speak Easy Words" }] }),
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  subscription: any | null;
};

const PLANS = [
  { product_id: "free", price_id: "free", label: "Free" },
  { product_id: "starter_plan", price_id: "starter_monthly", label: "Starter" },
  { product_id: "pro_plan", price_id: "pro_monthly", label: "Pro" },
];

function AdminPage() {
  const check = useServerFn(adminCheckAccess);
  const list = useServerFn(adminListUsers);
  const updateSub = useServerFn(adminUpdateSubscription);
  const deleteSub = useServerFn(adminDeleteSubscription);
  const grantSub = useServerFn(adminGrantSubscription);
  const deleteUser = useServerFn(adminDeleteUser);
  const setRole = useServerFn(adminSetUserRole);
  const resetPw = useServerFn(adminResetUserPassword);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await list();
      setUsers(res.users as AdminUser[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  }, [list]);

  useEffect(() => {
    (async () => {
      try {
        const { isAdmin } = await check();
        setAllowed(isAdmin);
        if (isAdmin) await refresh();
      } catch (e: any) {
        setError(e?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [check, refresh]);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Shield className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Access denied</h1>
        <p className="text-sm text-muted-foreground">You need admin privileges to view this page.</p>
        <Link to="/" className="text-sm text-primary underline">Back to home</Link>
      </div>
    );
  }

  const filtered = users.filter((u) =>
    !query || (u.email ?? "").toLowerCase().includes(query.toLowerCase()) || u.id.includes(query),
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <h1 className="text-base font-semibold text-foreground">Admin Control Panel</h1>
          <button
            onClick={() => run("refresh", async () => {})}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or id…"
            className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">{filtered.length} users</span>
        </div>

        <div className="space-y-3">
          {filtered.map((u) => {
            const isAdmin = u.roles.includes("admin");
            const sub = u.subscription;
            return (
              <div key={u.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">{u.email ?? "—"}</p>
                      {isAdmin && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {u.id} · joined {new Date(u.created_at).toLocaleDateString()}
                      {u.last_sign_in_at && ` · last in ${new Date(u.last_sign_in_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        run(`role-${u.id}`, () =>
                          setRole({ data: { user_id: u.id, role: "admin", grant: !isAdmin } }),
                        )
                      }
                      disabled={busy === `role-${u.id}`}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {isAdmin ? <ShieldOff className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                      {isAdmin ? "Revoke admin" : "Make admin"}
                    </button>
                    <button
                      onClick={async () => {
                        const pw = prompt("New password (min 8 chars):");
                        if (!pw) return;
                        await run(`pw-${u.id}`, () =>
                          resetPw({ data: { user_id: u.id, new_password: pw } }),
                        );
                        alert("Password updated.");
                      }}
                      disabled={busy === `pw-${u.id}`}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <KeyRound className="h-3 w-3" /> Reset password
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
                        run(`del-${u.id}`, () => deleteUser({ data: { user_id: u.id } }));
                      }}
                      disabled={busy === `del-${u.id}`}
                      className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subscription
                    </h3>
                  </div>
                  {sub ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col text-xs">
                        <span className="text-muted-foreground">Plan</span>
                        <select
                          defaultValue={sub.product_id}
                          onChange={(e) => {
                            const plan = PLANS.find((p) => p.product_id === e.target.value);
                            if (!plan) return;
                            run(`sub-${sub.id}-plan`, () =>
                              updateSub({
                                data: { id: sub.id, product_id: plan.product_id, price_id: plan.price_id },
                              }),
                            );
                          }}
                          className="rounded border border-border bg-background px-2 py-1"
                        >
                          {PLANS.map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <select
                          defaultValue={sub.status}
                          onChange={(e) =>
                            run(`sub-${sub.id}-status`, () =>
                              updateSub({ data: { id: sub.id, status: e.target.value } }),
                            )
                          }
                          className="rounded border border-border bg-background px-2 py-1"
                        >
                          {["active", "trialing", "past_due", "paused", "canceled"].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col text-xs">
                        <span className="text-muted-foreground">Period end</span>
                        <input
                          type="date"
                          defaultValue={sub.current_period_end ? sub.current_period_end.slice(0, 10) : ""}
                          onBlur={(e) =>
                            run(`sub-${sub.id}-end`, () =>
                              updateSub({
                                data: {
                                  id: sub.id,
                                  current_period_end: e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : null,
                                },
                              }),
                            )
                          }
                          className="rounded border border-border bg-background px-2 py-1"
                        />
                      </label>
                      <span className="text-[10px] text-muted-foreground">env: {sub.environment}</span>
                      <button
                        onClick={() => {
                          if (!confirm("Delete subscription record?")) return;
                          run(`subdel-${sub.id}`, () => deleteSub({ data: { id: sub.id } }));
                        }}
                        className="ml-auto flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" /> Remove sub
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">No subscription.</span>
                      {PLANS.filter((p) => p.product_id !== "free").map((p) => (
                        <button
                          key={p.product_id}
                          onClick={() =>
                            run(`grant-${u.id}-${p.product_id}`, () =>
                              grantSub({
                                data: {
                                  user_id: u.id,
                                  product_id: p.product_id,
                                  price_id: p.price_id,
                                  environment: getPaddleEnvironment(),
                                  days: 30,
                                },
                              }),
                            )
                          }
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" /> Grant {p.label} (30d)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
