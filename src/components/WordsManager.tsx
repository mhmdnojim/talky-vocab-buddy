import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  List as ListIcon,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Lock,
  Loader2,
} from "lucide-react";
import { CATEGORIES, VOCABULARY, type Category } from "@/data/vocabulary";
import {
  listCategories,
  listWords,
  insertWord,
  updateWord,
  deleteWord,
  nextWordPosition,
  type CustomCategory,
  type CustomWord,
} from "@/lib/customVocab";
import { generateVocabImage } from "@/lib/vocab.functions";
import { useServerFn } from "@tanstack/react-start";

interface Props {
  currentCategorySlug: string;
  onChanged?: () => void;
}

interface CatBlock {
  slug: string;
  label: string;
  emoji: string;
  isCustom: boolean;
  customId?: string;
}

export function WordsManager({ currentCategorySlug, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<CatBlock[]>([]);
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [wordsByCat, setWordsByCat] = useState<
    Record<string, { id: string; word: string; ipa: string; editable: boolean }[]>
  >({});
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const builtin: CatBlock[] = CATEGORIES.map((c) => ({
        slug: c.id,
        label: c.label,
        emoji: c.emoji,
        isCustom: false,
      }));
      const custom = await listCategories();
      setCustomCats(custom);
      const customBlocks: CatBlock[] = custom.map((c) => ({
        slug: c.slug,
        label: c.label,
        emoji: c.emoji,
        isCustom: true,
        customId: c.id,
      }));
      const all = [...builtin, ...customBlocks];
      setCats(all);

      const map: typeof wordsByCat = {};
      for (const c of builtin) {
        map[c.slug] = VOCABULARY.filter((v) => v.category === (c.slug as Category)).map(
          (v) => ({ id: v.id, word: v.word, ipa: v.ipa, editable: false }),
        );
      }
      await Promise.all(
        custom.map(async (c) => {
          const rows = await listWords(c.id);
          map[c.slug] = rows.map((r) => ({
            id: r.id,
            word: r.word,
            ipa: r.ipa,
            editable: true,
          }));
        }),
      );
      setWordsByCat(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary-foreground/80"
          aria-label="All words"
        >
          <ListIcon className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>All Vocabulary</SheetTitle>
        </SheetHeader>

        {loading && cats.length === 0 ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={[currentCategorySlug]}
            className="px-2 py-2"
          >
            {cats.map((c) => (
              <AccordionItem key={c.slug} value={c.slug}>
                <AccordionTrigger className="px-2 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{c.emoji}</span>
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs text-muted-foreground">
                      ({wordsByCat[c.slug]?.length ?? 0})
                    </span>
                    {c.slug === currentCategorySlug && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        current
                      </span>
                    )}
                    {!c.isCustom && (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 px-2 pb-3">
                  {(wordsByCat[c.slug] ?? []).map((w) => (
                    <WordRow
                      key={w.id}
                      word={w}
                      categorySlug={c.slug}
                      onChanged={async () => {
                        await refresh();
                        onChanged?.();
                      }}
                    />
                  ))}
                  {c.isCustom && c.customId && (
                    <AddWordRow
                      categoryId={c.customId}
                      onAdded={async () => {
                        await refresh();
                        onChanged?.();
                      }}
                    />
                  )}
                  {!c.isCustom && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      Built-in category — words are read-only.
                    </div>
                  )}
                  {c.slug !== currentCategorySlug && (
                    <Link
                      to="/learn/$category"
                      params={{ category: c.slug }}
                      onClick={() => setOpen(false)}
                      className="mt-2 block rounded-md bg-muted px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted/80"
                    >
                      Open this category →
                    </Link>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </SheetContent>
    </Sheet>
  );
}

function WordRow({
  word,
  categorySlug: _categorySlug,
  onChanged,
}: {
  word: { id: string; word: string; ipa: string; editable: boolean };
  categorySlug: string;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [w, setW] = useState(word.word);
  const [ipa, setIpa] = useState(word.ipa);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!w.trim()) return;
    setBusy(true);
    try {
      await updateWord(word.id, { word: w.trim(), ipa: ipa.trim() });
      setEditing(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${word.word}"?`)) return;
    setBusy(true);
    try {
      await deleteWord(word.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1.5">
        <Input
          value={w}
          onChange={(e) => setW(e.target.value)}
          className="h-8 flex-1"
          placeholder="Word"
        />
        <Input
          value={ipa}
          onChange={(e) => setIpa(e.target.value)}
          className="h-8 w-24"
          placeholder="IPA"
        />
        <Button size="icon" variant="ghost" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <div className="flex-1 truncate">
        <span className="text-sm">{word.word}</span>
        {word.ipa && (
          <span className="ml-2 text-xs text-muted-foreground">[{word.ipa}]</span>
        )}
      </div>
      {word.editable && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEditing(true)}
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={remove}
            disabled={busy}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

function AddWordRow({
  categoryId,
  onAdded,
}: {
  categoryId: string;
  onAdded: () => Promise<void> | void;
}) {
  const [w, setW] = useState("");
  const [ipa, setIpa] = useState("");
  const [busy, setBusy] = useState(false);
  const genImage = useServerFn(generateVocabImage);

  const add = async () => {
    if (!w.trim() || busy) return;
    setBusy(true);
    try {
      const position = await nextWordPosition(categoryId);
      let image_url: string | null = null;
      try {
        const res = await genImage({ data: { word: w.trim() } });
        image_url = res.dataUrl;
      } catch {
        /* ignore — image is optional */
      }
      await insertWord({
        category_id: categoryId,
        word: w.trim(),
        ipa: ipa.trim(),
        image_url,
        position,
      });
      setW("");
      setIpa("");
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-1 rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
      <Input
        value={w}
        onChange={(e) => setW(e.target.value)}
        className="h-8 flex-1"
        placeholder="New word"
        onKeyDown={(e) => {
          if (e.key === "Enter") void add();
        }}
      />
      <Input
        value={ipa}
        onChange={(e) => setIpa(e.target.value)}
        className="h-8 w-24"
        placeholder="IPA"
      />
      <Button size="icon" variant="ghost" onClick={add} disabled={busy || !w.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
    </div>
  );
}
