// Browser-side helpers for the user-created vocabulary stored in Lovable Cloud.
import { supabase } from "@/integrations/supabase/client";

export interface CustomCategory {
  id: string;
  slug: string;
  label: string;
  emoji: string;
  words_per_patch?: number;
}

export interface CustomWord {
  id: string;
  category_id: string;
  word: string;
  ipa: string;
  image_url: string | null;
  audio_url: string | null;
  example: string;
  position: number;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `cat-${Date.now()}`
  );
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function listCategories(): Promise<CustomCategory[]> {
  const { data, error } = await supabase
    .from("custom_categories")
    .select("id, slug, label, emoji, words_per_patch")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(slug: string): Promise<CustomCategory | null> {
  const { data, error } = await supabase
    .from("custom_categories")
    .select("id, slug, label, emoji, words_per_patch")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listWords(categoryId: string): Promise<CustomWord[]> {
  const { data, error } = await supabase
    .from("custom_words")
    .select("id, category_id, word, ipa, image_url, audio_url, example, position")
    .eq("category_id", categoryId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: {
  label: string;
  emoji: string;
}): Promise<CustomCategory> {
  const user_id = await requireUserId();
  let slug = slugify(input.label);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("custom_categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${slugify(input.label)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const { data, error } = await supabase
    .from("custom_categories")
    .insert({ label: input.label, emoji: input.emoji, slug, user_id })
    .select("id, slug, label, emoji")
    .single();
  if (error) throw error;
  return data;
}

export async function insertWord(input: {
  category_id: string;
  word: string;
  ipa: string;
  image_url: string | null;
  position: number;
}): Promise<void> {
  const user_id = await requireUserId();
  const { error } = await supabase.from("custom_words").insert({ ...input, user_id });
  if (error) throw error;
}

export async function updateWordImage(id: string, image_url: string): Promise<void> {
  const { error } = await supabase
    .from("custom_words")
    .update({ image_url })
    .eq("id", id);
  if (error) throw error;
}

export async function updateWordAudio(id: string, audio_url: string): Promise<void> {
  const { error } = await supabase
    .from("custom_words")
    .update({ audio_url })
    .eq("id", id);
  if (error) throw error;
}

export async function updateWordExample(id: string, example: string): Promise<void> {
  const { error } = await supabase
    .from("custom_words")
    .update({ example })
    .eq("id", id);
  if (error) throw error;
}

export async function createCategoryWithPatch(input: {
  label: string;
  emoji: string;
  words_per_patch: number;
}): Promise<CustomCategory> {
  const cat = await createCategory({ label: input.label, emoji: input.emoji });
  const { error } = await supabase
    .from("custom_categories")
    .update({ words_per_patch: input.words_per_patch })
    .eq("id", cat.id);
  if (error) throw error;
  return { ...cat, words_per_patch: input.words_per_patch };
}

export async function deleteCategory(id: string): Promise<void> {
  // Words are owned per-user too; remove them first since there's no FK cascade.
  await supabase.from("custom_words").delete().eq("category_id", id);
  const { error } = await supabase.from("custom_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function updateWord(id: string, patch: { word?: string; ipa?: string }): Promise<void> {
  const { error } = await supabase.from("custom_words").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteWord(id: string): Promise<void> {
  const { error } = await supabase.from("custom_words").delete().eq("id", id);
  if (error) throw error;
}

export async function nextWordPosition(category_id: string): Promise<number> {
  const { data, error } = await supabase
    .from("custom_words")
    .select("position")
    .eq("category_id", category_id)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data?.[0]?.position ?? -1) as number) + 1;
}

export async function exportAllUserData() {
  const { data: categories, error: catErr } = await supabase
    .from("custom_categories")
    .select("id, slug, label, emoji, created_at")
    .order("created_at", { ascending: false });
  if (catErr) throw catErr;

  const { data: words, error: wordErr } = await supabase
    .from("custom_words")
    .select("id, category_id, word, ipa, image_url, audio_url, example, position, created_at")
    .order("position", { ascending: true });
  if (wordErr) throw wordErr;

  const catMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const wordsWithCat = (words ?? []).map((w) => {
    const cat = catMap.get(w.category_id);
    return { ...w, category_slug: cat?.slug ?? "", category_label: cat?.label ?? "" };
  });

  return { categories: categories ?? [], words: wordsWithCat };
}

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, "\"\"")}"`;
  return v;
}

export function buildCsv(categories: CustomCategory[], words: (CustomWord & { category_slug: string; category_label: string })[]): string {
  const headers = ["category_label", "category_slug", "word", "ipa", "image_url", "position"];
  const rows = words.map((w) => [
    w.category_label,
    w.category_slug,
    w.word,
    w.ipa,
    w.image_url ?? "",
    String(w.position),
  ]);
  return [headers.join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n");
}

export function buildJson(categories: CustomCategory[], words: (CustomWord & { category_slug: string; category_label: string })[]): string {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const result = categories.map((c) => ({
    ...c,
    words: words
      .filter((w) => w.category_id === c.id)
      .map((w) => ({
        word: w.word,
        ipa: w.ipa,
        image_url: w.image_url,
        position: w.position,
      })),
  }));
  return JSON.stringify(result, null, 2);
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
