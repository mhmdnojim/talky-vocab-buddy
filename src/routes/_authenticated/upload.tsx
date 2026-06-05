import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Check,
  X,
  Sparkles,
  FileText,
  Square,
  Image as ImageIcon,
  Volume2,
  BookOpen,
  Lock,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseFileToText } from "@/lib/parseFile";
import {
  extractWordsFromText,
  generateVocabImage,
  generateWordsForTopic,
  generateExampleSentence,
} from "@/lib/vocab.functions";
import {
  createCategoryWithPatch,
  insertWord,
  updateWordImage,
  updateWordAudio,
  updateWordExample,
  listWords,
  listCategories,
} from "@/lib/customVocab";
import { useSubscription, getTierLimits } from "@/hooks/useSubscription";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/_authenticated/upload")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Add Vocabulary — AI Extract & Illustrate" },
      {
        name: "description",
        content:
          "Upload a file or describe a topic. AI extracts or invents the words and optionally generates images, voice, and example sentences.",
      },
    ],
  }),
  component: UploadPage,
});

type Mode = "file" | "topic";
type Phase = "idle" | "extracting" | "generating" | "done" | "cancelled" | "error";

interface WordProgress {
  id?: string; // db id once inserted
  word: string;
  ipa: string;
  patchIndex: number;
  image: "skip" | "pending" | "done" | "failed";
  audio: "skip" | "pending" | "done" | "failed";
  example: "skip" | "pending" | "done" | "failed";
}

async function fetchAudioDataUrl(word: string): Promise<string | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: word, lang: "en-US" }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function UploadPage() {
  const navigate = useNavigate();
  const extractFn = useServerFn(extractWordsFromText);
  const topicFn = useServerFn(generateWordsForTopic);
  const imageFn = useServerFn(generateVocabImage);
  const exampleFn = useServerFn(generateExampleSentence);

  const [mode, setMode] = useState<Mode>("file");
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<WordProgress[]>([]);
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState("");

  const [maxTotal, setMaxTotal] = useState(40);
  const [maxPerBatch, setMaxPerBatch] = useState(20);
  const [doImages, setDoImages] = useState(true);
  const [imageStyle, setImageStyle] = useState<
    "cartoon" | "realistic" | "watercolor" | "3d" | "pixel" | "line" | "anime" | "sketch"
  >("cartoon");
  const [doAudio, setDoAudio] = useState(false);
  const [doExample, setDoExample] = useState(false);

  const cancelRef = useRef(false);
  const busy = phase === "extracting" || phase === "generating";

  const addLog = (line: string) => setLog((l) => [...l, line]);

  const handleCancel = () => {
    cancelRef.current = true;
    setStatusMsg("Cancelling… (saving progress so far)");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (mode === "file" && !file) return;
    if (mode === "topic" && !topic.trim()) return;
    setError(null);
    setProgress([]);
    setLog([]);
    setStatusMsg("");
    cancelRef.current = false;
    setExtractProgress({ done: 0, total: 1 });

    try {
      // -------- Phase 1: extract words --------
      setPhase("extracting");
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

      const EXTRACT_PER_CALL = 40;

      if (mode === "file") {
        setStatusMsg("Reading file…");
        addLog("📄 Reading file…");
        const text = await parseFileToText(file!);
        if (!text.trim()) throw new Error("No text could be extracted from that file.");

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
        addLog(`✂️ ${textChunks.length} chunk(s), ~${perChunk} words each`);

        for (let i = 0; i < textChunks.length && words.length < maxTotal; i++) {
          if (cancelRef.current) break;
          setStatusMsg(`Extracting chunk ${i + 1}/${textChunks.length} — ${words.length}/${maxTotal} words`);
          addLog(`🤖 Chunk ${i + 1}/${textChunks.length}…`);
          try {
            const res = await extractFn({ data: { text: textChunks[i], maxWords: perChunk } });
            const before = words.length;
            pushUnique(res.words);
            addLog(`✅ Chunk ${i + 1}: +${words.length - before} (total ${words.length})`);
          } catch (err: any) {
            addLog(`⚠️ Chunk ${i + 1} failed: ${err?.message ?? "error"}`);
          }
          setExtractProgress({ done: i + 1, total: textChunks.length });
        }
        words = words.slice(0, maxTotal);
      } else {
        setStatusMsg(`Generating "${topic.trim()}"…`);
        addLog(`✨ Topic: "${topic.trim()}"`);
        const numCalls = Math.max(1, Math.ceil(maxTotal / EXTRACT_PER_CALL));
        const perCall = Math.ceil(maxTotal / numCalls);
        setExtractProgress({ done: 0, total: numCalls });
        for (let i = 0; i < numCalls && words.length < maxTotal; i++) {
          if (cancelRef.current) break;
          setStatusMsg(`Generating batch ${i + 1}/${numCalls} — ${words.length}/${maxTotal}`);
          addLog(`🤖 Call ${i + 1}/${numCalls}…`);
          try {
            const res = await topicFn({ data: { topic: topic.trim(), count: perCall } });
            const before = words.length;
            pushUnique(res.words);
            addLog(`✅ Call ${i + 1}: +${words.length - before} (total ${words.length})`);
          } catch (err: any) {
            addLog(`⚠️ Call ${i + 1} failed: ${err?.message ?? "error"}`);
          }
          setExtractProgress({ done: i + 1, total: numCalls });
        }
        words = words.slice(0, maxTotal);
      }

      if (cancelRef.current && !words.length) {
        setPhase("cancelled");
        setStatusMsg("Cancelled before any words were extracted.");
        return;
      }
      if (!words.length) throw new Error("AI did not return any words.");
      addLog(`🎉 Extracted ${words.length} unique words`);

      // -------- Create category & insert words --------
      setStatusMsg(`Creating category: ${label.trim()}`);
      addLog(`📁 Creating category "${label.trim()}" (patch size ${maxPerBatch})`);
      const category = await createCategoryWithPatch({
        label: label.trim(),
        emoji,
        words_per_patch: maxPerBatch,
      });

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
      addLog(`💾 Saved ${rows.length} words`);

      // Build progress entries
      const initialProgress: WordProgress[] = rows.map((r, i) => ({
        id: r.id,
        word: r.word,
        ipa: r.ipa,
        patchIndex: Math.floor(i / maxPerBatch),
        image: doImages ? "pending" : "skip",
        audio: doAudio ? "pending" : "skip",
        example: doExample ? "pending" : "skip",
      }));
      setProgress(initialProgress);

      // If nothing else to do, finish
      if (!doImages && !doAudio && !doExample) {
        setPhase("done");
        setStatusMsg("Done — words extracted.");
        addLog("✨ Skipping image/audio/example generation (none selected)");
        setTimeout(() => {
          navigate({ to: "/learn/$category", params: { category: category.slug } });
        }, 800);
        return;
      }

      // -------- Phase 2: generate per-word assets --------
      setPhase("generating");

      const updateWord = (idx: number, patch: Partial<WordProgress>) =>
        setProgress((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

      for (let i = 0; i < rows.length; i++) {
        if (cancelRef.current) break;
        const row = rows[i];
        const patchNum = Math.floor(i / maxPerBatch) + 1;
        const totalPatches = Math.ceil(rows.length / maxPerBatch);
        setStatusMsg(`Patch ${patchNum}/${totalPatches} — "${row.word}"`);

        if (doImages) {
          try {
            const { dataUrl } = await imageFn({ data: { word: row.word, style: imageStyle } });
            await updateWordImage(row.id, dataUrl);
            updateWord(i, { image: "done" });
          } catch (err) {
            console.error("image failed", row.word, err);
            updateWord(i, { image: "failed" });
          }
          if (cancelRef.current) break;
        }

        if (doAudio) {
          const audio = await fetchAudioDataUrl(row.word);
          if (audio) {
            try {
              await updateWordAudio(row.id, audio);
              updateWord(i, { audio: "done" });
            } catch {
              updateWord(i, { audio: "failed" });
            }
          } else {
            updateWord(i, { audio: "failed" });
          }
          if (cancelRef.current) break;
        }

        if (doExample) {
          try {
            const { sentence } = await exampleFn({ data: { word: row.word } });
            if (sentence) {
              await updateWordExample(row.id, sentence);
              updateWord(i, { example: "done" });
            } else {
              updateWord(i, { example: "failed" });
            }
          } catch {
            updateWord(i, { example: "failed" });
          }
        }
      }

      if (cancelRef.current) {
        setPhase("cancelled");
        setStatusMsg("Cancelled — partial results saved.");
        addLog("🛑 Cancelled by user. Saved what was finished.");
        return;
      }

      setPhase("done");
      setStatusMsg("Done!");
      addLog("✅ All done");
      setTimeout(() => {
        navigate({ to: "/learn/$category", params: { category: category.slug } });
      }, 800);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong");
      setPhase("error");
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
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("file")}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === "file" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
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
              mode === "topic" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            From AI topic
          </button>
        </div>

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
              <label htmlFor="topic-input" className="mb-1 block text-sm font-medium">Topic / field</label>
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
              {mode === "file" ? "Max words to extract" : "Total words to generate"} ({maxTotal})
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
              Words per patch ({maxPerBatch})
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
                ? `${Math.ceil(maxTotal / maxPerBatch)} patches of up to ${maxPerBatch} words each (one category).`
                : "All words fit in a single patch."}
            </p>
          </div>

          {/* Generate options */}
          <div className="rounded-xl border-2 border-border bg-card p-3">
            <div className="mb-2 text-sm font-medium">Also generate for each word</div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2 opacity-60">
                <input type="checkbox" checked disabled />
                <Check className="h-4 w-4 text-primary" />
                Word + IPA (always)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={doImages}
                  onChange={(e) => setDoImages(e.target.checked)}
                  disabled={busy}
                />
                <ImageIcon className="h-4 w-4 text-primary" />
                Image
              </label>
              {doImages && (
                <div className="ml-6">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Image style
                  </label>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value as typeof imageStyle)}
                    disabled={busy}
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  >
                    <option value="cartoon">Cartoon (flat, friendly)</option>
                    <option value="realistic">Realistic photo</option>
                    <option value="watercolor">Watercolor painting</option>
                    <option value="3d">3D render (Pixar-like)</option>
                    <option value="pixel">Pixel art (16-bit)</option>
                    <option value="line">Minimal line drawing</option>
                    <option value="anime">Anime / manga</option>
                    <option value="sketch">Pencil sketch</option>
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={doAudio}
                  onChange={(e) => setDoAudio(e.target.checked)}
                  disabled={busy}
                />
                <Volume2 className="h-4 w-4 text-primary" />
                Voice pronunciation
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={doExample}
                  onChange={(e) => setDoExample(e.target.checked)}
                  disabled={busy}
                />
                <BookOpen className="h-4 w-4 text-primary" />
                Example sentence
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Unchecked items can be generated later from the learn page.
            </p>
          </div>

          {mode === "file" && (
            <div>
              <label className="mb-1 block text-sm font-medium">File</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-8 text-center transition hover:border-primary">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{file ? file.name : "Choose file"}</span>
                <span className="text-xs text-muted-foreground">.xlsx, .csv, .pdf, .docx, .txt</span>
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

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !label.trim() || (mode === "file" ? !file : !topic.trim())}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? statusMsg : phase === "done" ? "Done! Opening…" : "Build vocabulary"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-destructive/40 px-4 py-3 font-semibold text-destructive transition hover:bg-destructive/10"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border-2 border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </form>

        {(log.length > 0 || progress.length > 0) && (
          <CombinedPanel
            phase={phase}
            log={log}
            extractProgress={extractProgress}
            progress={progress}
            doImages={doImages}
            doAudio={doAudio}
            doExample={doExample}
          />
        )}
      </main>
    </div>
  );
}

function CombinedPanel({
  phase,
  log,
  extractProgress,
  progress,
  doImages,
  doAudio,
  doExample,
}: {
  phase: Phase;
  log: string[];
  extractProgress: { done: number; total: number };
  progress: WordProgress[];
  doImages: boolean;
  doAudio: boolean;
  doExample: boolean;
}) {
  const extractPct =
    extractProgress.total > 0 ? Math.round((extractProgress.done / extractProgress.total) * 100) : 0;

  const wordDone = (p: WordProgress) => {
    const checks: ("skip" | "pending" | "done" | "failed")[] = [p.image, p.audio, p.example];
    return checks.every((s) => s === "skip" || s === "done" || s === "failed");
  };
  const genDone = progress.filter(wordDone).length;
  const genPct = progress.length > 0 ? Math.round((genDone / progress.length) * 100) : 0;

  return (
    <div className="mt-6 space-y-4 rounded-xl border-2 border-border bg-card p-4">
      {/* Phase 1: extraction */}
      <section>
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Phase 1 — Extract words
            {phase === "extracting" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            {phase !== "extracting" && extractProgress.total > 0 && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </span>
          {extractProgress.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {extractProgress.done}/{extractProgress.total} ({extractPct}%)
            </span>
          )}
        </div>
        {extractProgress.total > 0 && (
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${extractPct}%` }}
            />
          </div>
        )}
        <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
          {log.map((line, i) => (
            <li key={i} className={i === log.length - 1 ? "text-foreground" : ""}>
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/* Phase 2: generation */}
      {progress.length > 0 && (doImages || doAudio || doExample) && (
        <section className="border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              Phase 2 — Generate assets
              {phase === "generating" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {phase === "done" && <Check className="h-3.5 w-3.5 text-primary" />}
              {phase === "cancelled" && <X className="h-3.5 w-3.5 text-destructive" />}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {genDone}/{progress.length} ({genPct}%)
            </span>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${genPct}%` }}
            />
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {progress.map((p, i) => {
              const prev = i > 0 ? progress[i - 1].patchIndex : -1;
              const isNewPatch = p.patchIndex !== prev;
              const patchWords = progress.filter((x) => x.patchIndex === p.patchIndex);
              const patchAllDone = patchWords.every(wordDone);
              return (
                <li key={i}>
                  {isNewPatch && (
                    <div className="mt-2 mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
                      <span>Patch {p.patchIndex + 1}</span>
                      {patchAllDone && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        ({patchWords.filter(wordDone).length}/{patchWords.length})
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{p.word}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <AssetBadge icon={<ImageIcon className="h-3 w-3" />} status={p.image} />
                      <AssetBadge icon={<Volume2 className="h-3 w-3" />} status={p.audio} />
                      <AssetBadge icon={<BookOpen className="h-3 w-3" />} status={p.example} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function AssetBadge({
  icon,
  status,
}: {
  icon: React.ReactNode;
  status: "skip" | "pending" | "done" | "failed";
}) {
  if (status === "skip") return null;
  const cls =
    status === "done"
      ? "bg-primary/10 text-primary"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${cls}`}>
      {status === "pending" ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
    </span>
  );
}
