import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  
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
import { speak, langLabelToBcp47 } from "@/lib/speak";
import { getCategoryBySlug, listWords, updateWordImage, listCategories, type CustomCategory } from "@/lib/customVocab";
import { generateVocabImage, translateWords, IMAGE_STYLES, type ImageStyle } from "@/lib/vocab.functions";
import { useServerFn } from "@tanstack/react-start";
import { RubyText } from "@/components/RubyText";

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

const DEFAULT_PATCH_SIZE = 20;

export const Route = createFileRoute("/_authenticated/learn/$category")({
  head: ({ params }) => {
    const cat = CATEGORIES.find((c) => c.id === params.category);
    const title = cat ? `${cat.label} Vocabulary` : "Vocabulary";
    const url = `https://talky-vocab-buddy.lovable.app/learn/${params.category}`;
    const description = `Learn ${cat?.label ?? "English"} vocabulary with cartoon pictures and natural pronunciation.`;
    return {
      meta: [
        { title: `${title} — Learn with Voice` },
        { name: "description", content: description },
        { property: "og:title", content: `${title} — Learn with Voice` },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: `${title}`,
            url,
            description,
            learningResourceType: "Vocabulary deck",
            inLanguage: "en",
          }),
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

const FONT_SIZE_LEVELS = [
  { label: "A", class: "text-sm" },
  { label: "A", class: "text-base" },
  { label: "A", class: "text-lg" },
  { label: "A", class: "text-xl" },
  { label: "A", class: "text-2xl" },
  { label: "A", class: "text-3xl" },
];

function Learn() {
  const { category } = Route.useParams();
  const [words, setWords] = useState<DisplayWord[] | null>(null);
  const [patchSize, setPatchSize] = useState<number>(DEFAULT_PATCH_SIZE);
  const [title, setTitle] = useState<string>("Vocabulary");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const autoplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [targetLang, setTargetLang] = useState<string>(() => {
    if (typeof window === "undefined") return "Arabic";
    return localStorage.getItem("vocab-target-lang") || "Arabic";
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [sourcePinyin, setSourcePinyin] = useState<Record<string, string[] | null>>({});
  const [translationPinyin, setTranslationPinyin] = useState<Record<string, string[] | null>>({});
  const [translating, setTranslating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [flipped, setFlipped] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vocab-flipped") === "true";
  });
  const [imageStyle, setImageStyle] = useState<ImageStyle>(() => {
    if (typeof window === "undefined") return "cartoon";
    return (localStorage.getItem("vocab-image-style") as ImageStyle) || "cartoon";
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return FONT_SIZE_LEVELS.length - 1;
    const saved = parseInt(localStorage.getItem("vocab-font-size") ?? String(FONT_SIZE_LEVELS.length - 1), 10);
    return Number.isFinite(saved) && saved >= 0 && saved < FONT_SIZE_LEVELS.length ? saved : FONT_SIZE_LEVELS.length - 1;
  });
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const navigate = useNavigate();
  const translate = useServerFn(translateWords);
  const regenImage = useServerFn(generateVocabImage);

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((rows) => { if (!cancelled) setCustomCats(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Translate all words when words or language changes
  useEffect(() => {
    if (!words || words.length === 0) return;
    let cancelled = false;
    setTranslations({});
    setSourcePinyin({});
    setTranslationPinyin({});
    setTranslating(true);
    (async () => {
      try {
        const wordsList = words.map((w) => w.word);
        const res = await translate({ data: { words: wordsList, targetLang } });
        if (cancelled) return;
        const tMap: Record<string, string> = {};
        const spMap: Record<string, string[] | null> = {};
        const tpMap: Record<string, string[] | null> = {};
        wordsList.forEach((w, i) => {
          if (res.translations[i]) tMap[w] = res.translations[i];
          spMap[w] = res.sourcePinyin?.[i] ?? null;
          tpMap[w] = res.translationPinyin?.[i] ?? null;
        });
        setTranslations(tMap);
        setSourcePinyin(spMap);
        setTranslationPinyin(tpMap);
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
      const res = await regenImage({ data: { word: cur.word, style: imageStyle } });
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
          setPatchSize(cat.words_per_patch && cat.words_per_patch > 0 ? cat.words_per_patch : DEFAULT_PATCH_SIZE);
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
  }, [category, reloadKey]);

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
    const word = flipped ? translations[current.word] ?? current.word : current.word;
    void speak(word, flipped ? { lang: langLabelToBcp47(targetLang) } : undefined);
  }, [current?.id, flipped]);

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
        const word = flipped ? translations[current.word] ?? current.word : current.word;
        void speak(word, flipped ? { lang: langLabelToBcp47(targetLang) } : undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current?.id, words?.length, flipped]);

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
            value={imageStyle}
            onChange={(e) => {
              const v = e.target.value as ImageStyle;
              setImageStyle(v);
              try { localStorage.setItem("vocab-image-style", v); } catch { /* ignore */ }
            }}
            className="h-9 rounded-full border-2 border-primary-foreground/80 bg-primary px-2 text-xs font-medium text-primary-foreground focus:outline-none capitalize"
            aria-label="Image style"
            title="Image style for regeneration"
          >
            {Object.keys(IMAGE_STYLES).map((s) => (
              <option key={s} value={s} className="text-foreground capitalize">
                {s}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => {
              const slug = e.target.value;
              if (slug !== category) navigate({ to: "/learn/$category", params: { category: slug } });
            }}
            className="h-9 max-w-[140px] rounded-full border-2 border-primary-foreground/80 bg-primary px-2 text-xs font-medium text-primary-foreground focus:outline-none"
            aria-label="Category"
            title="Switch category"
          >
            <optgroup label="Built-in" className="text-foreground">
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="text-foreground">
                  {c.emoji} {c.label}
                </option>
              ))}
            </optgroup>
            {customCats.length > 0 && (
              <optgroup label="My categories" className="text-foreground">
                {customCats.map((c) => (
                  <option key={c.id} value={c.slug} className="text-foreground">
                    {c.emoji} {c.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
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
          <button
            onClick={() => {
              setFlipped((v) => {
                const next = !v;
                try { localStorage.setItem("vocab-flipped", String(next)); } catch { /* ignore */ }
                return next;
              });
            }}
            className="flex h-9 items-center justify-center rounded-full border-2 border-primary-foreground/80 bg-primary px-3 text-xs font-medium text-primary-foreground focus:outline-none"
            aria-label={flipped ? "Show original" : "Show translation as main"}
            title={flipped ? "Show original" : "Show translation as main"}
          >
            {flipped ? "EN" : targetLang.slice(0, 2).toUpperCase()}
          </button>
          <div className="flex items-center rounded-full border-2 border-primary-foreground/80 bg-primary text-primary-foreground">
            <button
              onClick={() => {
                setFontSize((v) => {
                  const next = Math.max(0, v - 1);
                  try { localStorage.setItem("vocab-font-size", String(next)); } catch { /* ignore */ }
                  return next;
                });
              }}
              disabled={fontSize <= 0}
              className="flex h-9 w-7 items-center justify-center rounded-l-full text-xs font-bold disabled:opacity-40"
              aria-label="Decrease font size"
              title="Smaller"
            >
              A
            </button>
            <span className="pointer-events-none select-none text-[10px] font-medium opacity-60">
              {fontSize + 1}
            </span>
            <button
              onClick={() => {
                setFontSize((v) => {
                  const next = Math.min(FONT_SIZE_LEVELS.length - 1, v + 1);
                  try { localStorage.setItem("vocab-font-size", String(next)); } catch { /* ignore */ }
                  return next;
                });
              }}
              disabled={fontSize >= FONT_SIZE_LEVELS.length - 1}
              className="flex h-9 w-7 items-center justify-center rounded-r-full text-sm font-bold disabled:opacity-40"
              aria-label="Increase font size"
              title="Bigger"
            >
              A
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 pb-8 pt-4">
        {words.length > patchSize && (
          <PatchTabs
            total={words.length}
            patchSize={patchSize}
            currentIdx={idx}
            onJump={(i) => setIdx(i)}
          />
        )}
        {(() => {
          const patchStart = Math.floor(idx / patchSize) * patchSize;
          const patchEnd = Math.min(patchStart + patchSize, words.length);
          const inPatch = idx - patchStart;
          const patchLen = patchEnd - patchStart;
          const pct = (inPatch / Math.max(1, patchLen - 1)) * 100;
          return (
            <div className="mb-3 px-1">
              <input
                type="range"
                min={patchStart}
                max={patchEnd - 1}
                value={idx}
                onChange={(e) => setIdx(Number(e.target.value))}
                aria-label="Patch progress"
                className="vocab-progress w-full"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--muted) ${pct}%, var(--muted) 100%)`,
                }}
              />
              <div className="mt-1 text-center text-xs text-muted-foreground">
                {inPatch + 1} / {patchLen}
              </div>
            </div>
          );
        })()}
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
                alt={`${current.word} illustration`}
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <span className="text-sm">👤</span>
            </div>
            <RubyText
              text={flipped ? translations[current.word] ?? current.word : current.word}
              pinyin={flipped ? translationPinyin[current.word] : sourcePinyin[current.word]}
              className={`${FONT_SIZE_LEVELS[fontSize].class} font-medium leading-tight`}
            />
            {translations[current.word] && (
              <RubyText
                text={flipped ? current.word : translations[current.word]}
                pinyin={flipped ? sourcePinyin[current.word] : translationPinyin[current.word]}
                className={`ml-auto ${FONT_SIZE_LEVELS[fontSize].class} font-medium leading-tight text-foreground`}
              />
            )}
          </div>
        </div>

        <VoiceControls
          word={flipped ? translations[current.word] ?? current.word : current.word}
          lang={flipped ? langLabelToBcp47(targetLang) : undefined}
        />

        <div className="mt-8 text-center">
          <div className={`${FONT_SIZE_LEVELS[Math.min(fontSize + 1, FONT_SIZE_LEVELS.length - 1)].class} font-semibold text-foreground`}>
            <RubyText
              text={flipped ? translations[current.word] ?? current.word : current.word}
              pinyin={flipped ? translationPinyin[current.word] : sourcePinyin[current.word]}
            />
          </div>
          {!flipped && current.ipa && (
            <div className="mt-2 text-base text-muted-foreground">[ {current.ipa} ]</div>
          )}
          <div
            className="mt-1 flex min-h-[1.75rem] items-center justify-center gap-2 text-sm text-muted-foreground"
            dir="auto"
          >
            {translations[current.word] ? (
              <>
                <RubyText
                  text={flipped ? current.word : translations[current.word]}
                  pinyin={flipped ? sourcePinyin[current.word] : translationPinyin[current.word]}
                />
                <button
                  type="button"
                  onClick={() =>
                    void speak(flipped ? current.word : translations[current.word], {
                      lang: flipped ? undefined : langLabelToBcp47(targetLang),
                    })
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-primary shadow-sm transition hover:bg-muted"
                  aria-label={`Play ${flipped ? "original" : targetLang}`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : translating ? (
              "…"
            ) : (
              ""
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

function VoiceControls({ word, lang }: { word: string; lang?: string }) {
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
        onClick={() => void speak(word, lang ? { lang } : undefined)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Play pronunciation"
      >
        <Volume2 className="h-6 w-6 text-primary" />
      </button>
      <button
        onClick={() => void speak(word, { slow: true, lang })}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-md"
        aria-label="Play slowly"
      >
        <Snail className="h-6 w-6 text-primary" />
      </button>
    </div>
  );
}

function PatchTabs({
  total,
  patchSize,
  currentIdx,
  onJump,
}: {
  total: number;
  patchSize: number;
  currentIdx: number;
  onJump: (i: number) => void;
}) {
  const count = Math.ceil(total / patchSize);
  const currentPatch = Math.floor(currentIdx / patchSize);
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, p) => {
        const start = p * patchSize;
        const end = Math.min(start + patchSize, total);
        const active = p === currentPatch;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onJump(start)}
            aria-label={`Patch ${p + 1} (words ${start + 1}–${end})`}
            className={`flex h-8 min-w-8 items-center justify-center rounded-full border-2 px-2.5 text-xs font-semibold transition ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary"
            }`}
          >
            {p + 1}
          </button>
        );
      })}
    </div>
  );
}
