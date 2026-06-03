// Browser-side helpers for the user-created vocabulary stored in Lovable Cloud.
import { supabase } from "@/integrations/supabase/client";

export interface CustomCategory {
  id: string;
  slug: string;
  label: string;
  emoji: string;
}

export interface CustomWord {
  id: string;
  category_id: string;
  word: string;
  ipa: string;
  image_url: string | null;
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

export async function listCategories(): Promise<CustomCategory[]> {
  const { data, error } = await supabase
    .from("custom_categories")
    .select("id, slug, label, emoji")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(slug: string): Promise<CustomCategory | null> {
  const { data, error } = await supabase
    .from("custom_categories")
    .select("id, slug, label, emoji")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listWords(categoryId: string): Promise<CustomWord[]> {
  const { data, error } = await supabase
    .from("custom_words")
    .select("id, category_id, word, ipa, image_url, position")
    .eq("category_id", categoryId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(input: {
  label: string;
  emoji: string;
}): Promise<CustomCategory> {
  let slug = slugify(input.label);
  // Make slug unique
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
    .insert({ label: input.label, emoji: input.emoji, slug })
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
  const { error } = await supabase.from("custom_words").insert(input);
  if (error) throw error;
}

export async function updateWordImage(id: string, image_url: string): Promise<void> {
  const { error } = await supabase
    .from("custom_words")
    .update({ image_url })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("custom_categories").delete().eq("id", id);
  if (error) throw error;
}
