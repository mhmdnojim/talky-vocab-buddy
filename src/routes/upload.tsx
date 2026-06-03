import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Upload, Loader2, Check, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseFileToText } from "@/lib/parseFile";
import { extractWordsFromText, generateVocabImage } from "@/lib/vocab.functions";
import {
  createCategory,
  insertWord,
  updateWordImage,
  listWords,
} from "@/lib/customVocab";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload Vocabulary - AI Extract & Illustrate" },
      {
        name: "description",
        content:
          "Upload an Excel, PDF, Word, or text file. AI extracts the words and generates cartoon illustrations automatically.",
      },
    ],
  }),
  component: UploadPage,
});

type Status = "idle" | "parsing" | "extracting" | "generating" | "done" | "error";

interface WordProgress {
  word: string;
  ipa: string;
  status: "pending" | "generating" | "done" | "failed";
}

function UploadPage() {
  const navigate = useNavigate();
  const extractFn = useServerFn(extractWordsFromText);
  const imageFn = useServerFn(generateVocabImage);

  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<WordProgress[]>([]);
  const [maxWords, setMaxWords] = useState(20);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !label.trim()) return;
    setError(null);
    setProgress([]);

    try {
      // 1. Parse file → text
      setStatus("parsing");
      const text = await parseFileToText(file);
      if (!text.trim()) throw new Error("No text could be extracted from that file.");

      // 2. AI extract words
      setStatus("extracting");
      const { words } = await extractFn({ data: { text, maxWords } });
      if (!words.length) throw new Error("AI did not find any vocabulary words in this file.");

      // 3. Create category
      const category = await createCategory({ label: label.trim(), emoji });

      // 4. Insert all words first (no image), then generate images one by one
      setProgress(
        words.map((w) => ({ word: w.word, ipa: w.ipa, status: "pending" as const })),
      );
      setStatus("generating");

      for (let i = 0; i < words.length; i++) {
        await insertWord({
          category_id: category.id,
          word: words[i].word,
          ipa: words[i].ipa,
          image_url: null,
          position: i,
        });
      }

      // Fetch fresh rows so we have IDs to update with images
      const rows = await listWords(category.id);

      for (let i = 0; i < rows.length; i++) {
        setProgress((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "generating" } : p)),
        );
        try {
          const { dataUrl } = await imageFn({ data: { word: rows[i].word } });
          await updateWordImage(rows[i].id, dataUrl);
          setProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "done" } : p)),
          );
        } catch (err) {
          console.error("image gen failed for", rows[i].word, err);
          setProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "failed" } : p)),
          );
        }
      }

      setStatus("done");
      setTimeout(() => {
        navigate({ to: "/learn/$category", params: { category: category.slug } });
      }, 800);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong");
      setStatus("error");
    }
  };

  const busy = status === "parsing" || status === "extracting" || status === "generating";

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
        <h1 className="text-lg font-semibold">Add Category from File</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-6">
        <p className="mb-6 text-sm text-muted-foreground">
          Upload an Excel, PDF, Word, or text file. AI will extract the words and
          generate a cartoon illustration for each one.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Category name</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Animals"
                required
                disabled={busy}
                className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-sm font-medium">Emoji</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                disabled={busy}
                className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-center text-xl outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Max words ({maxWords})
            </label>
            <input
              type="range"
              min={5}
              max={60}
              value={maxWords}
              onChange={(e) => setMaxWords(Number(e.target.value))}
              disabled={busy}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              More words = longer wait. Each word takes a few seconds to illustrate.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">File</label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-8 text-center transition hover:border-primary">
              <Upload className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose file"}
              </span>
              <span className="text-xs text-muted-foreground">
                .xlsx, .csv, .pdf, .docx, .txt
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.md,.pdf,.docx,.doc"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy || !file || !label.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === "parsing" && "Reading file…"}
            {status === "extracting" && "AI extracting words…"}
            {status === "generating" && "Generating illustrations…"}
            {status === "done" && "Done! Opening category…"}
            {(status === "idle" || status === "error") && "Generate vocabulary"}
          </button>

          {error && (
            <div className="rounded-lg border-2 border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </form>

        {progress.length > 0 && (
          <div className="mt-6 rounded-xl border-2 border-border bg-card p-4">
            <div className="mb-2 text-sm font-medium">
              Progress: {progress.filter((p) => p.status === "done").length} /{" "}
              {progress.length}
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {progress.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.word}</span>
                  {p.status === "pending" && (
                    <span className="text-xs text-muted-foreground">waiting</span>
                  )}
                  {p.status === "generating" && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                  {p.status === "done" && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  {p.status === "failed" && (
                    <X className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
