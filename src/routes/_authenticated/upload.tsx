import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Upload, Loader2, Check, X, Sparkles, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseFileToText } from "@/lib/parseFile";
import {
  extractWordsFromText,
  generateVocabImage,
  generateWordsForTopic,
} from "@/lib/vocab.functions";
import {
  createCategory,
  insertWord,
  updateWordImage,
  listWords,
} from "@/lib/customVocab";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Add Vocabulary - AI Extract & Illustrate" },
      {
        name: "description",
        content:
          "Upload a file or describe a topic. AI extracts or invents the words and generates cartoon illustrations.",
      },
    ],
  }),
  component: UploadPage,
});

type Mode = "file" | "topic";
type Status =
  | "idle"
  | "parsing"
  | "extracting"
  | "generating"
  | "done"
  | "error";

interface WordProgress {
  word: string;
  ipa: string;
  status: "pending" | "generating" | "done" | "failed";
  batchIndex: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function UploadPage() {
  const navigate = useNavigate();
  const extractFn = useServerFn(extractWordsFromText);
  const topicFn = useServerFn(generateWordsForTopic);
  const imageFn = useServerFn(generateVocabImage);

  const [mode, setMode] = useState<Mode>("file");
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<WordProgress[]>([]);
  const [statusMsg, setStatusMsg] = useState("");

  // User-configurable
  const [maxTotal, setMaxTotal] = useState(40); // total words to extract / generate
  const [maxPerBatch, setMaxPerBatch] = useState(20); // words per category

  const busy =
    status === "parsing" || status === "extracting" || status === "generating";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (mode === "file" && !file) return;
    if (mode === "topic" && !topic.trim()) return;
    setError(null);
    setProgress([]);
    setStatusMsg("");

    try {
      // 1. Get the word list
      let words: { word: string; ipa: string }[];
      if (mode === "file") {
        setStatus("parsing");
        setStatusMsg("Reading file…");
        const text = await parseFileToText(file!);
        if (!text.trim())
          throw new Error("No text could be extracted from that file.");
        setStatus("extracting");
        setStatusMsg("AI extracting words…");
        const res = await extractFn({ data: { text, maxWords: maxTotal } });
        words = res.words;
      } else {
        setStatus("extracting");
        setStatusMsg("AI generating words…");
        const res = await topicFn({
          data: { topic: topic.trim(), count: maxTotal },
        });
        words = res.words;
      }
      if (!words.length) throw new Error("AI did not return any words.");

      // 2. Split into batches → one category per batch
      const batches = chunk(words, maxPerBatch);
      setProgress(
        words.map((w, i) => ({
          word: w.word,
          ipa: w.ipa,
          status: "pending" as const,
          batchIndex: Math.floor(i / maxPerBatch),
        })),
      );
      setStatus("generating");

      let firstSlug: string | null = null;
      let globalIdx = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchLabel =
          batches.length === 1 ? label.trim() : `${label.trim()} ${b + 1}`;
        setStatusMsg(
          `Creating batch ${b + 1} of ${batches.length}: ${batchLabel}`,
        );
        const category = await createCategory({ label: batchLabel, emoji });
        if (b === 0) firstSlug = category.slug;

        // Insert words (no image yet) so user can already browse
        for (let i = 0; i < batch.length; i++) {
          await insertWord({
            category_id: category.id,
            word: batch[i].word,
            ipa: batch[i].ipa,
            image_url: null,
            position: i,
          });
        }
        const rows = await listWords(category.id);

        // Generate images for this batch
        for (let i = 0; i < rows.length; i++) {
          const idxInProgress = globalIdx + i;
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === idxInProgress ? { ...p, status: "generating" } : p,
            ),
          );
          try {
            const { dataUrl } = await imageFn({ data: { word: rows[i].word } });
            await updateWordImage(rows[i].id, dataUrl);
            setProgress((prev) =>
              prev.map((p, idx) =>
                idx === idxInProgress ? { ...p, status: "done" } : p,
              ),
            );
          } catch (err) {
            console.error("image gen failed for", rows[i].word, err);
            setProgress((prev) =>
              prev.map((p, idx) =>
                idx === idxInProgress ? { ...p, status: "failed" } : p,
              ),
            );
          }
        }
        globalIdx += batch.length;
      }

      setStatus("done");
      setStatusMsg("Done!");
      setTimeout(() => {
        if (firstSlug) {
          navigate({ to: "/learn/$category", params: { category: firstSlug } });
        } else {
          navigate({ to: "/" });
        }
      }, 800);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong");
      setStatus("error");
    }
  };

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
        <h1 className="text-lg font-semibold">Add Category</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-6">
        {/* Mode toggle */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("file")}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === "file"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            From file
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("topic")}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === "topic"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            From AI topic
          </button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "file"
            ? "Upload an Excel, PDF, Word, or text file. AI extracts the words and generates cartoon illustrations."
            : "Type a topic or field (e.g. “Kitchen items”, “Medical terms”). AI invents the words and illustrates each one."}
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

          {mode === "topic" && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Topic / field
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Football terms, Hospital, Kitchen items"
                disabled={busy}
                className="w-full rounded-lg border-2 border-border bg-card px-3 py-2 outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">
              {mode === "file" ? "Max words to extract" : "Total words to generate"}{" "}
              ({maxTotal})
            </label>
            <input
              type="range"
              min={5}
              max={mode === "file" ? 3000 : 2000}
              step={5}
              value={maxTotal}
              onChange={(e) => setMaxTotal(Number(e.target.value))}
              disabled={busy}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Words per category (batch size) ({maxPerBatch})
            </label>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={maxPerBatch}
              onChange={(e) => setMaxPerBatch(Number(e.target.value))}
              disabled={busy}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {maxTotal > maxPerBatch
                ? `Will create ${Math.ceil(maxTotal / maxPerBatch)} categories of up to ${maxPerBatch} words each.`
                : "All words fit in a single category."}
            </p>
          </div>

          {mode === "file" && (
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
          )}

          <button
            type="submit"
            disabled={
              busy ||
              !label.trim() ||
              (mode === "file" ? !file : !topic.trim())
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? statusMsg : status === "done" ? "Done! Opening…" : "Generate vocabulary"}
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
              {progress.map((p, i) => {
                const prevBatch = i > 0 ? progress[i - 1].batchIndex : -1;
                const isNewBatch = p.batchIndex !== prevBatch;
                return (
                  <li key={i}>
                    {isNewBatch && (
                      <div className="mt-2 mb-1 text-xs font-semibold text-primary">
                        Batch {p.batchIndex + 1}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
