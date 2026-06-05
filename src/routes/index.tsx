import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, LogOut, LogIn, Download, FileSpreadsheet, FileJson, Sparkles, User } from "lucide-react";
import { CATEGORIES, VOCABULARY } from "@/data/vocabulary";
import {
  deleteCategory,
  listCategories,
  type CustomCategory,
  exportAllUserData,
  buildCsv,
  buildJson,
  downloadFile,
} from "@/lib/customVocab";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { useSubscription } from "@/hooks/useSubscription";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Speak Easy Words — Learn English with Pictures & Voice" },
      {
        name: "description",
        content:
          "Learn English vocabulary with cartoon illustrations and natural human voice pronunciation. Upload your own list and AI builds a deck for you.",
      },
      { property: "og:title", content: "Speak Easy Words — Learn English with Pictures & Voice" },
      { property: "og:description", content: "Browse categories and learn with pictures, IPA, and voice." },
      { property: "og:url", content: "https://talky-vocab-buddy.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://talky-vocab-buddy.lovable.app/" }],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const sub = useSubscription();

  const reload = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const isAuthed = !!userData.user;
    setAuthed(isAuthed);
    if (!isAuthed) {
      setCustomCats([]);
      setCounts({});
      return;
    }
    const cats = await listCategories();
    setCustomCats(cats);
    if (cats.length) {
      const { data } = await supabase
        .from("custom_words")
        .select("category_id")
        .in("category_id", cats.map((c) => c.id));
      const c: Record<string, number> = {};
      for (const row of data ?? []) {
        c[row.category_id] = (c[row.category_id] ?? 0) + 1;
      }
      setCounts(c);
    }
  };

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void reload());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const removeCat = async (id: string) => {
    if (!confirm("Delete this category and all its words?")) return;
    await deleteCategory(id);
    void reload();
  };

  const doExport = async (format: "csv" | "json") => {
    setExportOpen(false);
    try {
      const { categories, words } = await exportAllUserData();
      if (format === "csv") {
        const csv = buildCsv(categories, words);
        downloadFile(csv, "vocabulary.csv", "text/csv;charset=utf-8;");
      } else {
        const json = buildJson(categories, words);
        downloadFile(json, "vocabulary.json", "application/json;charset=utf-8;");
      }
    } catch {
      alert("Export failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <PaymentTestModeBanner />
      <header className="bg-primary px-5 py-6 text-primary-foreground shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
            <p className="mt-1 text-sm opacity-90">
              Tap a category to start learning with pictures and voice
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              aria-label="Pricing"
              className="flex h-9 items-center gap-1.5 shrink-0 rounded-full bg-primary-foreground/10 px-3 text-sm font-semibold transition hover:bg-primary-foreground/20"
            >
              <Sparkles className="h-4 w-4" />
              {sub.tier === "free" ? "Upgrade" : <span className="capitalize">{sub.tier}</span>}
            </Link>
            {authed ? (
              <>
                <Link
                  to="/account"
                  aria-label="Account"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 transition hover:bg-primary-foreground/20"
                >
                  <User className="h-4 w-4" />
                </Link>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    void reload();
                  }}
                  aria-label="Sign out"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 transition hover:bg-primary-foreground/20"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate({ to: "/auth" })}
                aria-label="Sign in"
                className="flex h-9 items-center gap-1.5 shrink-0 rounded-full bg-primary-foreground/10 px-3 text-sm font-semibold transition hover:bg-primary-foreground/20"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Categories</h2>
          {authed && (
            <div className="flex items-center gap-2">
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-border bg-card p-1 shadow-lg">
                    <button
                      onClick={() => doExport("csv")}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      Download CSV
                    </button>
                    <button
                      onClick={() => doExport("json")}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted"
                    >
                      <FileJson className="h-4 w-4 text-amber-600" />
                      Download JSON
                    </button>
                  </div>
                )}
              </div>
              <Link
                to="/upload"
                className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> Add from file
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const count = VOCABULARY.filter((w) => w.category === c.id).length;
            return (
              <Link
                key={c.id}
                to="/learn/$category"
                params={{ category: c.id }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-border bg-card p-5 text-center shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <div className="text-4xl">{c.emoji}</div>
                <div className="mt-2 font-semibold text-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground">{count} words</div>
              </Link>
            );
          })}
        </div>

        {authed && customCats.length > 0 && (
          <>
            <h2 className="mb-4 mt-8 text-lg font-semibold text-foreground">
              Your categories
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {customCats.map((c) => (
                <div key={c.id} className="relative">
                  <Link
                    to="/learn/$category"
                    params={{ category: c.slug }}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-border bg-card p-5 text-center shadow-sm transition hover:border-primary hover:shadow-md"
                  >
                    <div className="text-4xl">{c.emoji}</div>
                    <div className="mt-2 font-semibold text-foreground">
                      {c.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {counts[c.id] ?? 0} words
                    </div>
                  </Link>
                  <button
                    onClick={() => removeCat(c.id)}
                    aria-label="Delete category"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {!authed && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Sign in
            </button>{" "}
            to upload your own word lists and save custom categories.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Upload Excel, PDF, Word or text — AI extracts words and draws each one.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
