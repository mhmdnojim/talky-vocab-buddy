import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, LogOut, Download, FileSpreadsheet, FileJson } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Vocabulary — Learn English with Pictures & Voice" },
      {
        name: "description",
        content:
          "Learn English vocabulary with cartoon illustrations and natural human voice pronunciation. Upload your own list and AI builds a deck for you.",
      },
      { property: "og:title", content: "Vocabulary — Learn English with Pictures & Voice" },
      { property: "og:description", content: "Browse categories and learn with pictures, IPA, and voice." },
      { property: "og:url", content: "https://talky-vocab-buddy.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://talky-vocab-buddy.lovable.app/" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
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
      <header className="bg-primary px-5 py-6 text-primary-foreground shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
            <p className="mt-1 text-sm opacity-90">
              Tap a category to start learning with pictures and voice
            </p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
            aria-label="Sign out"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 transition hover:bg-primary-foreground/20"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Categories</h2>
          <Link
            to="/upload"
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add from file
          </Link>
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

        {customCats.length > 0 && (
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

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Upload Excel, PDF, Word or text — AI extracts words and draws each one.
        </p>
      </main>
    </div>
  );
}
