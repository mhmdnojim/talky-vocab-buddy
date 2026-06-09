import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, FolderOpen, Loader2, Check, X, Image as ImageIcon, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createCategoryWithPatch,
  insertWord,
  updateWordImage,
  updateWordAudio,
  listWords,
  slugify,
} from "@/lib/customVocab";

export const Route = createFileRoute("/_authenticated/bulk-import")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Bulk Import — Folder Upload" },
      {
        name: "description",
        content:
          "Bulk-import flashcards from local folders. Pick a folder of images (and optional audio); files are uploaded in batches and grouped into categories by sub-folder name.",
      },
    ],
  }),
  component: BulkImportPage,
});

const IMG_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const AUD_EXT = new Set(["mp3", "ogg", "wav", "m4a", "aac"]);
const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 year
const CONCURRENCY = 4;

type FileKind = "image" | "audio";

interface ScannedFile {
  file: File;
  category: string; // first-level subfolder
  baseName: string; // file name without extension
  kind: FileKind;
}

interface WordRow {
  category: string;
  word: string;
  image?: File;
  audio?: File;
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
}

function splitPath(rel: string): string[] {
  return rel.split("/").filter(Boolean);
}

function classify(name: string): FileKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXT.has(ext)) return "image";
  if (AUD_EXT.has(ext)) return "audio";
  return null;
}

function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  // strip trailing "_2", "-1" etc. so multiple images of same word group together
  return base.replace(/[_\-\s]+\d+$/, "").trim();
}

async function uploadOne(
  userId: string,
  categorySlug: string,
  file: File,
  baseName: string,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const safeBase = slugify(baseName) || "file";
  const path = `${userId}/${categorySlug}/${safeBase}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage
    .from("vocab-media")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage
    .from("vocab-media")
    .createSignedUrl(path, SIGNED_TTL);
  if (sErr || !data) throw sErr ?? new Error("Failed to sign URL");
  return data.signedUrl;
}

function BulkImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const [scanned, setScanned] = useState<ScannedFile[]>([]);
  const [emoji, setEmoji] = useState("📚");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [rows, setRows] = useState<WordRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const byCat = new Map<string, { images: number; audio: number }>();
    for (const s of scanned) {
      const e = byCat.get(s.category) ?? { images: 0, audio: 0 };
      if (s.kind === "image") e.images += 1;
      else e.audio += 1;
      byCat.set(s.category, e);
    }
    return Array.from(byCat.entries()).map(([cat, c]) => ({ cat, ...c }));
  }, [scanned]);

  const onPickFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setDone(false);
    setRows([]);
    const files = Array.from(e.target.files ?? []);
    const out: ScannedFile[] = [];
    let rootPrefix = "";
    if (files.length) {
      const first = (files[0] as any).webkitRelativePath as string;
      rootPrefix = first.split("/")[0] ?? "";
    }
    for (const f of files) {
      const rel = (f as any).webkitRelativePath as string;
      const parts = splitPath(rel);
      // parts: [rootFolder, subfolder, ..., filename]
      // category = first level inside the root; if root itself contains files, use root name
      let category: string;
      let filename: string;
      if (parts.length >= 3) {
        category = parts[1];
        filename = parts[parts.length - 1];
      } else if (parts.length === 2) {
        category = rootPrefix || "imported";
        filename = parts[1];
      } else {
        continue;
      }
      const kind = classify(filename);
      if (!kind) continue;
      out.push({ file: f, category, baseName: baseNameOf(filename), kind });
    }
    setScanned(out);
  };

  const startImport = async () => {
    if (!scanned.length) return;
    setError(null);
    setBusy(true);
    setDone(false);
    cancelRef.current = false;

    try {
      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr || !u.user) throw new Error("Not signed in");
      const userId = u.user.id;

      // Group: category -> word -> { image?, audio? }
      type Bucket = { image?: File; audio?: File };
      const byCat = new Map<string, Map<string, Bucket>>();
      for (const s of scanned) {
        if (!byCat.has(s.category)) byCat.set(s.category, new Map());
        const cat = byCat.get(s.category)!;
        const b = cat.get(s.baseName) ?? {};
        // Keep first occurrence (skip duplicates like word_2.png)
        if (s.kind === "image" && !b.image) b.image = s.file;
        if (s.kind === "audio" && !b.audio) b.audio = s.file;
        cat.set(s.baseName, b);
      }

      // Flatten into rows for UI
      const allRows: WordRow[] = [];
      for (const [category, words] of byCat) {
        for (const [word, b] of words) {
          allRows.push({ category, word, image: b.image, audio: b.audio, status: "pending" });
        }
      }
      setRows(allRows);

      // Process per category
      for (const [category, words] of byCat) {
        if (cancelRef.current) break;
        setStatus(`Creating category "${category}"…`);
        const cat = await createCategoryWithPatch({
          label: category,
          emoji,
          words_per_patch: 20,
        });

        // Insert word rows in order
        const entries = Array.from(words.entries());
        for (let i = 0; i < entries.length; i++) {
          const [word] = entries[i];
          await insertWord({
            category_id: cat.id,
            word,
            ipa: "",
            image_url: null,
            position: i,
          });
        }
        const dbRows = await listWords(cat.id);
        const dbByWord = new Map(dbRows.map((r) => [r.word, r]));

        // Concurrent upload pool for this category
        let cursor = 0;
        const total = entries.length;
        let completed = 0;

        const setRowStatus = (cat: string, word: string, patch: Partial<WordRow>) =>
          setRows((prev) =>
            prev.map((r) => (r.category === cat && r.word === word ? { ...r, ...patch } : r)),
          );

        const worker = async () => {
          while (!cancelRef.current) {
            const idx = cursor++;
            if (idx >= entries.length) return;
            const [word, b] = entries[idx];
            const dbRow = dbByWord.get(word);
            if (!dbRow) {
              setRowStatus(category, word, { status: "failed", error: "row not found" });
              continue;
            }
            setRowStatus(category, word, { status: "uploading" });
            try {
              if (b.image) {
                const url = await uploadOne(userId, cat.slug, b.image, word);
                await updateWordImage(dbRow.id, url);
              }
              if (b.audio) {
                const url = await uploadOne(userId, cat.slug, b.audio, word);
                await updateWordAudio(dbRow.id, url);
              }
              setRowStatus(category, word, { status: "done" });
            } catch (err: any) {
              setRowStatus(category, word, {
                status: "failed",
                error: err?.message ?? "upload failed",
              });
            } finally {
              completed++;
              setStatus(`Uploading "${category}" — ${completed}/${total}`);
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      }

      setStatus(cancelRef.current ? "Cancelled (partial import saved)." : "Import complete.");
      setDone(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const totalImages = summary.reduce((s, c) => s + c.images, 0);
  const totalAudio = summary.reduce((s, c) => s + c.audio, 0);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="flex items-center gap-3 bg-primary px-4 py-4 text-primary-foreground shadow-md">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary-foreground/80"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Bulk Import</h1>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Pick a root folder from your laptop. Each sub-folder becomes a category;
          each file becomes a word using its name (without extension). Images and
          audio with matching names are paired automatically.
        </p>

        <div className="rounded-xl border-2 border-dashed border-border bg-card p-6 text-center">
          <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <input
            ref={inputRef}
            type="file"
            multiple
            // @ts-expect-error non-standard but widely supported
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={onPickFolder}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Choose folder
          </button>
          {scanned.length > 0 && (
            <p className="mt-3 text-sm">
              Found <b>{scanned.length}</b> files — <ImageIcon className="inline h-4 w-4" />{" "}
              {totalImages} images, <Volume2 className="inline h-4 w-4" /> {totalAudio} audio,
              across <b>{summary.length}</b> categor{summary.length === 1 ? "y" : "ies"}.
            </p>
          )}
        </div>

        {summary.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-3">
              <label className="text-sm font-medium">Emoji for new categories:</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
                className="w-14 rounded border-2 border-border px-2 py-1 text-center"
                disabled={busy}
              />
            </div>
            <ul className="divide-y divide-border text-sm">
              {summary.map((s) => (
                <li key={s.cat} className="flex items-center justify-between py-1.5">
                  <span className="font-medium">{s.cat}</span>
                  <span className="text-muted-foreground">
                    {s.images} img · {s.audio} audio
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.length > 0 && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={startImport}
              disabled={busy || done}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {done ? "Imported" : busy ? "Importing…" : "Start import"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="rounded-lg border-2 border-border px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-border bg-card text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Category</th>
                  <th className="px-2 py-1 text-left">Word</th>
                  <th className="px-2 py-1">Img</th>
                  <th className="px-2 py-1">Audio</th>
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">{r.category}</td>
                    <td className="px-2 py-1 font-medium">{r.word}</td>
                    <td className="px-2 py-1 text-center">{r.image ? "✓" : "—"}</td>
                    <td className="px-2 py-1 text-center">{r.audio ? "✓" : "—"}</td>
                    <td className="px-2 py-1">
                      {r.status === "pending" && <span className="text-muted-foreground">queued</span>}
                      {r.status === "uploading" && (
                        <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                      )}
                      {r.status === "done" && <Check className="inline h-4 w-4 text-green-600" />}
                      {r.status === "failed" && (
                        <span className="text-red-600">
                          <X className="inline h-4 w-4" /> {r.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
