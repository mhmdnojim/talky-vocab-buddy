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
  ssr: false,
  head: () => ({
    meta: [
      { title: "Add Vocabulary — AI Extract & Illustrate" },
      {
        name: "description",
        content:
          "Upload a file or describe a topic. AI extracts or invents the words and generates cartoon illustrations.",
      },
      { property: "og:title", content: "Add Vocabulary — AI Extract & Illustrate" },
      { property: "og:description", content: "Upload a file or topic; AI builds an illustrated deck." },
      { property: "og:url", content: "https://talky-vocab-buddy.lovable.app/upload" },
    ],
    links: [
      { rel: "canonical", href: "https://talky-vocab-buddy.lovable.app/upload" },
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
  const [extractLog, setExtractLog] = useState<string[]>([]);
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });


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
    setExtractLog([]);
    setStatusMsg("");

    setExtractProgress({ done: 0, total: 1 });

    try {
      // 1. Get the word list
      let words: { word: string; ipa: string }[] = [];
      const seen = new Set<string>();
      const pushUnique = (arr: { word: string; ipa: string }[]) => {
        for (const w of arr) {
          const k = w.word.trim().toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          words.push({ word: w.word.trim(), ipa: w.ipa });
        }
      };

      const EXTRACT_PER_CALL = 40; // keep each AI call short to avoid timeouts

      if (mode === "file") {
        setStatus("parsing");
        setStatusMsg("Reading file…");
        setExtractLog(["📄 Reading file…"]);
        const text = await parseFileToText(file!);
        if (!text.trim())
          throw new Error("No text could be extracted from that file.");

        setStatus("extracting");
        const CHUNK_CHARS = 6000;
        const textChunks: string[] = [];
        for (let i = 0; i < text.length; i += CHUNK_CHARS) {
          textChunks.push(text.slice(i, i + CHUNK_CHARS));
        }
        const perChunk = Math.max(
          5,
          Math.min(EXTRACT_PER_CALL, Math.ceil(maxTotal / textChunks.length)),
        );
        setExtractProgress({ done: 0, total: textChunks.length });
        setExtractLog((l) => [
          ...l,
          `✂️ Split text into ${textChunks.length} chunk${textChunks.length > 1 ? "s" : ""} (~${perChunk} words each)`,
        ]);

        for (let i = 0; i < textChunks.length && words.length < maxTotal; i++) {
          setStatusMsg(
            `AI extracting chunk ${i + 1}/${textChunks.length} — ${words.length}/${maxTotal} words so far`,
          );
          setExtractLog((l) => [
            ...l,
            `🤖 Chunk ${i + 1}/${textChunks.length}: asking AI for up to ${perChunk} words…`,
          ]);
          try {
            const res = await extractFn({
              data: { text: textChunks[i], maxWords: perChunk },
            });
            const before = words.length;
            pushUnique(res.words);
            setExtractLog((l) => [
              ...l,
              `✅ Chunk ${i + 1}: +${words.length - before} new (total ${words.length})`,
            ]);
          } catch (e: any) {
            setExtractLog((l) => [
              ...l,
              `⚠️ Chunk ${i + 1} failed: ${e?.message ?? "error"} — continuing`,
            ]);
          }
          setExtractProgress({ done: i + 1, total: textChunks.length });
        }
        words = words.slice(0, maxTotal);
      } else {
        setStatus("extracting");
        setExtractLog([`✨ Generating words for topic: "${topic.trim()}"`]);
        const numCalls = Math.max(1, Math.ceil(maxTotal / EXTRACT_PER_CALL));
        const perCall = Math.ceil(maxTotal / numCalls);
        setExtractProgress({ done: 0, total: numCalls });
        setExtractLog((l) => [
          ...l,
          `📦 ${numCalls} AI call${numCalls > 1 ? "s" : ""} of ~${perCall} words each`,
        ]);
        for (let i = 0; i < numCalls && words.length < maxTotal; i++) {
          setStatusMsg(
            `AI generating batch ${i + 1}/${numCalls} — ${words.length}/${maxTotal} so far`,
          );
          setExtractLog((l) => [
            ...l,
            `🤖 Call ${i + 1}/${numCalls}: asking AI for ${perCall} words…`,
          ]);
          try {
            const res = await topicFn({
              data: { topic: topic.trim(), count: perCall },
            });
            const before = words.length;
            pushUnique(res.words);
            setExtractLog((l) => [
              ...l,
              `✅ Call ${i + 1}: +${words.length - before} new (total ${words.length})`,
            ]);
          } catch (e: any) {
            setExtractLog((l) => [
              ...l,
              `⚠️ Call ${i + 1} failed: ${e?.message ?? "error"} — continuing`,
            ]);
          }
          setExtractProgress({ done: i + 1, total: numCalls });
        }
        words = words.slice(0, maxTotal);
      }
      if (!words.length) throw new Error("AI did not return any words.");
      setExtractLog((l) => [...l, `🎉 Extracted ${words.length} unique words`]);

      // 2. Single category — patches are just visual groupings of `maxPerBatch`
      setProgress(
        words.map((w, i) => ({
          word: w.word,
          ipa: w.ipa,
          status: "pending" as const,
          batchIndex: Math.floor(i / maxPerBatch),
        })),
      );
      setStatus("generating");

      setStatusMsg(`Creating category: ${label.trim()}`);
      const category = await createCategory({ label: label.trim(), emoji });
      const firstSlug = category.slug;

      // Insert all words (no image yet) so user can already browse
      for (let i = 0; i < words.length; i++) {
        await insertWord({
          category_id: category.id,
          word: words[i].word,
          ipa: words[i].ipa,
          image_url: null,
          position: i,
        });
      }
      const rows = await listWords(category.id);

      // Generate images for each word
      for (let i = 0; i < rows.length; i++) {
        const patchNum = Math.floor(i / maxPerBatch) + 1;
        const totalPatches = Math.ceil(rows.length / maxPerBatch);
        setStatusMsg(
          `Patch ${patchNum}/${totalPatches} — illustrating "${rows[i].word}"`,
        );
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
              <label htmlFor="category-name" className="mb-1 block text-sm font-medium">Category name</label>
              <input
                id="category-name"
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
              <label htmlFor="category-emoji" className="mb-1 block text-sm font-medium">Emoji</label>
              <input
                id="category-emoji"
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
              <label htmlFor="topic-input" className="mb-1 block text-sm font-medium">
                Topic / field
              </label>
              <input
                id="topic-input"
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
            <label htmlFor="max-total" className="mb-1 block text-sm font-medium">
              {mode === "file" ? "Max words to extract" : "Total words to generate"}{" "}
              ({maxTotal})
            </label>
            <input
              id="max-total"
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
            <label htmlFor="max-per-batch" className="mb-1 block text-sm font-medium">
              Words per category (batch size) ({maxPerBatch})
            </label>
            <input
              id="max-per-batch"
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

        {extractLog.length > 0 && <ExtractLogPanel log={extractLog} />}
        {progress.length > 0 && <ProgressPanel progress={progress} />}
      </main>
    </div>
  );
}
function ExtractLogPanel({ log }: { log: string[] }) {
  return (
    <div className="mt-6 rounded-xl border-2 border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        AI extraction log
      </div>
      <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
        {log.map((line, i) => (
          <li key={i} className={i === log.length - 1 ? "text-foreground" : ""}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}


function ProgressPanel({ progress }: { progress: WordProgress[] }) {
  const doneCount = progress.filter((p) => p.status === "done").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;
  const pct = Math.round(((doneCount + failedCount) / progress.length) * 100);
  return (
    <div className="mt-6 rounded-xl border-2 border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>Progress: {doneCount} / {progress.length}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
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
  );
}
