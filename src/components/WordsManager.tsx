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
import {
  List as ListIcon,
  Trash2,
  Lock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { CATEGORIES, VOCABULARY, type Category } from "@/data/vocabulary";
import {
  listCategories,
  deleteCategory,
} from "@/lib/customVocab";
import { supabase } from "@/integrations/supabase/client";

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
  count: number;
}

export function WordsManager({ currentCategorySlug, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<CatBlock[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const builtin: CatBlock[] = CATEGORIES.map((c) => ({
        slug: c.id,
        label: c.label,
        emoji: c.emoji,
        isCustom: false,
        count: VOCABULARY.filter((v) => v.category === (c.id as Category)).length,
      }));
      // Show built-ins immediately so the list is never empty if custom fetch fails.
      setCats(builtin);

      let custom: Awaited<ReturnType<typeof listCategories>> = [];
      try {
        custom = await listCategories();
      } catch (e) {
        console.error("listCategories failed", e);
      }
      const customBlocks: CatBlock[] = await Promise.all(
        custom.map(async (c) => {
          let count = 0;
          try {
            const { count: n } = await supabase
              .from("custom_words")
              .select("id", { count: "exact", head: true })
              .eq("category_id", c.id);
            count = n ?? 0;
          } catch (e) {
            console.error("count failed for", c.slug, e);
          }
          return {
            slug: c.slug,
            label: c.label,
            emoji: c.emoji,
            isCustom: true,
            customId: c.id,
            count,
          };
        }),
      );
      setCats([...builtin, ...customBlocks]);
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
          <ul className="divide-y">
            {cats.map((c) => {
              const isCurrent = c.slug === currentCategorySlug;
              return (
                <li key={c.slug} className="flex items-center gap-1 px-2">
                  <Link
                    to="/learn/$category"
                    params={{ category: c.slug }}
                    onClick={() => setOpen(false)}
                    className="flex flex-1 items-center gap-2 px-2 py-3 hover:bg-muted/60 rounded-md"
                  >
                    <span className="text-lg">{c.emoji}</span>
                    <span className="font-medium flex-1 truncate">{c.label}</span>
                    <span className="text-xs text-muted-foreground">({c.count})</span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        current
                      </span>
                    )}
                    {!c.isCustom && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  {c.isCustom && c.customId && (
                    <DeleteCategoryButton
                      categoryId={c.customId}
                      label={c.label}
                      onDeleted={async () => {
                        await refresh();
                        onChanged?.();
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DeleteCategoryButton({
  categoryId,
  label,
  onDeleted,
}: {
  categoryId: string;
  label: string;
  onDeleted: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (
      !confirm(
        `Delete category "${label}" and all its words? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCategory(categoryId);
      await onDeleted();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="icon"
      variant="ghost"
      className="mr-1 h-8 w-8 text-destructive shrink-0"
      onClick={remove}
      disabled={busy}
      aria-label={`Delete category ${label}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
