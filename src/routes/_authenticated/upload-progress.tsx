import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Volume2,
  BookOpen,
  Loader2,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload-progress")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Build progress" }],
  }),
  component: ProgressPage,
});

type Phase = "idle" | "extracting" | "generating" | "done" | "cancelled" | "error";

interface WordProgress {
  id: string;
  word: string;
  ipa: string;
  patchIndex: number;
  image: "skip" | "pending" | "done" | "failed";
  audio: "skip" | "pending" | "done" | "failed";
  example: "skip" | "pending" | "done" | "failed";
}

interface Snapshot {
  phase: Phase;
  progress: WordProgress[];
  doImages: boolean;
  doAudio: boolean;
  doExample: boolean;
  categoryLabel: string;
}

const STORAGE_KEY = "vocab-upload-progress";

function ProgressPage() {
  const [snap, setSnap] = useState<Snapshot | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Snapshot) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const ch = new BroadcastChannel("vocab-upload-progress");
    ch.onmessage = (e) => {
      setSnap(e.data as Snapshot);
    };
    // Request initial state from sender
    ch.postMessage({ type: "request" });
    return () => ch.close();
  }, []);

  const wordDone = (p: WordProgress) =>
    [p.image, p.audio, p.example].every((s) => s === "skip" || s === "done" || s === "failed");

  if (!snap) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
        Waiting for build to start in the original tab…
      </div>
    );
  }

  const { progress, phase, doImages, doAudio, doExample, categoryLabel } = snap;
  const genDone = progress.filter(wordDone).length;
  const genPct = progress.length > 0 ? Math.round((genDone / progress.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-1 text-lg font-semibold">Phase 2 — Generate assets</h1>
      {categoryLabel && (
        <p className="mb-4 text-sm text-muted-foreground">Category: {categoryLabel}</p>
      )}

      <div className="rounded-xl border-2 border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Progress
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
        <ul className="space-y-1 text-sm">
          {progress.map((p, i) => {
            const prev = i > 0 ? progress[i - 1].patchIndex : -1;
            const isNewPatch = p.patchIndex !== prev;
            const patchWords = progress.filter((x) => x.patchIndex === p.patchIndex);
            const patchAllDone = patchWords.every(wordDone);
            return (
              <li key={p.id}>
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
                    {doImages && <Badge icon={<ImageIcon className="h-3 w-3" />} status={p.image} />}
                    {doAudio && <Badge icon={<Volume2 className="h-3 w-3" />} status={p.audio} />}
                    {doExample && <Badge icon={<BookOpen className="h-3 w-3" />} status={p.example} />}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Badge({
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
