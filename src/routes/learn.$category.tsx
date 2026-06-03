import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Play,
  Pause,
  Star,
  Volume2,
  Snail,
  Mic,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  CATEGORIES,
  getByCategory,
  type Category,
} from "@/data/vocabulary";
import { speak } from "@/lib/speak";
import { getCategoryBySlug, listWords, updateWordImage } from "@/lib/customVocab";
import { generateVocabImage, translateWords } from "@/lib/vocab.functions";
import { useServerFn } from "@tanstack/react-start";

const LANGUAGES = [
  "Arabic", "Spanish", "French", "German", "Italian", "Portuguese",
  "Russian", "Chinese", "Japanese", "Korean", "Hindi", "Turkish",
  "Dutch", "Polish", "Swedish", "English",
];

const BUILTIN: Category[] = ["emergency", "greetings", "daily", "food", "travel"];

interface DisplayWord {
  id: string;
  word: string;
  ipa: string;
  image: string | null;
}

export const Route = createFileRoute("/learn/$category")({
  head: ({ params }) => {
    const cat = CATEGORIES.find((c) => c.id === params.category);
    const title = cat ? `${cat.label} Vocabulary` : "Vocabulary";
    return {
      meta: [
        { title: `${title} - Learn with Voice` },
        {
          name: "description",
          content: `Learn ${cat?.label ?? "English"} vocabulary with cartoon pictures and natural pronunciation.`,
        },
      ],
    };
  },
  component: Learn,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Category not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          Back to categories
        </Link>
      </div>
    </div>
  ),
});

function Learn() {
  const { category } = Route.useParams();
  const [words, setWords] = useState<DisplayWord[] | null>(null);
  const [title, setTitle] = useState<string>("Vocabulary");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const autoplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [targetLang, setTargetLang] = useState<string>(() => {
    if (typeof window === "undefined") return "Arabic";
    return localStorage.getItem("vocab-target-lang") || "Arabic";
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const translate = useServerFn(translateWords);
  const regenImage = useServerFn(generateVocabImage);

  // Translate all words when words or language changes
  useEffect(() => {
    if (!words || words.length === 0) return;
    let cancelled = false;
    setTranslations({});
    setTranslating(true);
    (async () => {
      try {
        const wordsList = words.map((w) => w.word);
        const res = await translate({ data: { words: wordsList, targetLang } });
        if (cancelled) return;
        const map: Record<string, string> = {};
        wordsList.forEach((w, i) => {
          if (res.translations[i]) map[w] = res.translations[i];
        });
        setTranslations(map);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [words, targetLang]);

  const changeLang = (lang: string) => {
    setTargetLang(lang);
    try {
      localStorage.setItem("vocab-target-lang", lang);
    } catch {
      /* ignore */
    }
  };

  const handleRegenerate = async () => {
    if (!words || regenerating) return;
    const cur = words[idx];
    if (!cur) return;
    setRegenerating(true);
    try {
      const res = await regenImage({ data: { word: cur.word } });
      const newImage = res.dataUrl;
      setWords((prev) =>
        prev ? prev.map((w, i) => (i === idx ? { ...w, image: newImage } : w)) : prev,
      );
      // Persist for custom words (UUIDs)
      if (/^[0-9a-f-]{36}$/i.test(cur.id)) {
        try {
          await updateWordImage(cur.id, newImage);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegenerating(false);
    }
  };

  // Load words (builtin or custom)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (BUILTIN.includes(category as Category)) {
          const cat = CATEGORIES.find((c) => c.id === category)!;
          if (cancelled) return;
          setTitle(cat.label);
          setWords(
            getByCategory(category as Category).map((w) => ({
              id: w.id,
              word: w.word,
              ipa: w.ipa,
              image: w.image,
            })),
          );
        } else {
          const cat = await getCategoryBySlug(category);
          if (!cat) {
            if (!cancelled) setLoadError("Category not found.");
            return;
          }
          const rows = await listWords(cat.id);
          if (cancelled) return;
          setTitle(`${cat.emoji} ${cat.label}`);
          setWords(
            rows.map((r) => ({
              id: r.id,
              word: r.word,
              ipa: r.ipa,
              image: r.image_url,
            })),
          );
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vocab-favs");
      if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const persistFavs = (next: Set<string>) => {
    setFavorites(next);
    try {
      localStorage.setItem("vocab-favs", JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const current = words?.[idx];

  const go = (n: number) => {
    if (!words || words.length === 0) return;
    setIdx((i) => (i + n + words.length) % words.length);
  };

  useEffect(() => {
    if (!current) return;
    void speak(current.word);
  }, [current?.id]);

  useEffect(() => {
    if (!autoplay) return;
    let cancelled = false;
    (async () => {
      await new Promise<void>((r) => {
        autoplayRef.current = setTimeout(r, 2500);
      });
      if (cancelled) return;
      go(1);
    })();
    return () => {
      cancelled = true;
      if (autoplayRef.current) clearTimeout(autoplayRef.current);
    };
  }, [autoplay, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === " " && current) {
        e.preventDefault();
        void speak(current.word);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current?.id, words?.length]);

  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
    touchStart.current = null;
  };

  const toggleFav = () => {
    if (!current) return;
    const next = new Set(favorites);
    if (next.has(current.id)) next.delete(current.id);
    else next.add(current.id);
    persistFavs(next);
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-destructive">{loadError}</p>
          <Link to="/" className="mt-4 inline-block text-primary underline">
            Back
          </Link>
        </div>
      </div>
    );
  }

  if (!words) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-6 text-center">
        No words in this category yet.
        <Link to="/" className="ml-2 text-primary underline">
          Go back
        </Link>
      </div>
    );
  }

  const isFav = favorites.has(current.id);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex items-center justify-between bg-primary px-4 py-4 text-primary-foreground shadow-md">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary-foreground/80"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoplay((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary-foreground/80"
            aria-label={autoplay ? "Pause autoplay" : "Start autoplay"}
          >
            {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <select
            value={targetLang}
            onChange={(e) => changeLang(e.target.value)}
            className="h-9 rounded-full border-2 border-primary-foreground/80 bg-primary px-2 text-xs font-medium text-primary-foreground focus:outline-none"
            aria-label="Translation language"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} className="text-foreground">
                {l}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 pb-8 pt-4">
        <div
          className="relative overflow-hidden rounded-2xl bg-card shadow-sm"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            onClick={toggleFav}
            aria-label={isFav ? "Remove favorite" : "Add favorite"}
            className="absolute right-3 top-3 z-10"
          >
            <Star
              className={`h-7 w-7 transition ${
                isFav ? "fill-primary text-primary" : "text-primary"
              }`}
            />
          </button>

          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            aria-label="Regenerate image"
            className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 text-primary shadow-md backdrop-blur transition hover:bg-card disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
          </button>

          <div className="relative">
            {current.image ? (
              <img
                src={current.image}
                alt={current.word}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-muted text-6xl">
                ✨
              </div>
            )}
            <button
              onClick={() => go(-1)}
              className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground/40 transition hover:text-foreground"
              aria-label="Previous"
            >
              <ChevronLeft className="h-9 w-9" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground/40 transition hover:text-foreground"
              aria-label="Next"
            >
              <ChevronRight className="h-9 w-9" />
            </button>
          </div>

          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <span className="text-sm">👤</span>
            </div>
            <span className="text-xl font-medium">{current.word}</span>
          </div>
        </div>

        <VoiceControls word={current.word} />

        <div className="mt-8 text-center">
          <div className="text-2xl font-semibold text-foreground">{current.word}</div>
          {current.ipa && (
            <div className="mt-2 text-base text-muted-foreground">[ {current.ipa} ]</div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            {idx + 1} / {words.length}
          </div>
        </div>
      </main>
    </div>
  );
}

function VoiceControls({ word }: { word: string }) {
  const [recording, setRecording] = useState(false);
  return (
    <div className="mt-6 flex items-center justify-center gap-5">
      <button
        onClick={() => {
          setRecording((v) => !v);
          setTimeout(() => setRecording(false), 1500);
        }}
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-md transition ${
          recording ? "ring-4 ring-primary/40" : ""
        }`}
        aria-label="Practice pronunciation"
      >
        <Mic className="h-6 w-6 text-primary" />
      </button>
      <button
        onClick={() => void speak(word)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Play pronunciation"
      >
        <Volume2 className="h-6 w-6 text-primary" />
      </button>
      <button
        onClick={() => void speak(word, { slow: true })}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Play slowly"
      >
        <Snail className="h-6 w-6 text-primary" />
      </button>
    </div>
  );
}
