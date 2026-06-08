// Server functions for AI-powered vocabulary extraction and image generation.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ExtractInput = z.object({
  text: z.string().min(1).max(2_000_000),
  maxWords: z.number().min(1).max(3000).default(50),
});

const TranslateInput = z.object({
  words: z.array(z.string().min(1).max(120)).min(1).max(200),
  targetLang: z.string().min(2).max(40),
});

export const translateWords = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TranslateInput.parse(input))
  .handler(async ({ data }) => {
    const empty = (msg: string) => ({
      sourceLang: "Unknown",
      translations: data.words.map(() => ""),
      sourcePinyin: data.words.map(() => null as string[] | null),
      translationPinyin: data.words.map(() => null as string[] | null),
      error: msg,
    });
    const list = data.words.map((w, i) => `${i + 1}. ${w}`).join("\n");
    const prompt = `Detect the source language, then translate each item to ${data.targetLang}. Keep translations short (1-4 words). Do not add notes.

For any string (source OR translation) that contains Chinese characters (Hanzi), also return a "pinyin" field: an array with one entry PER Chinese character in that string, in order, using standard Hanyu Pinyin WITH tone marks (e.g. "nǐ", "hǎo"). Non-Chinese characters are skipped. If a string has no Chinese characters, set its pinyin to null.

Return ONLY strict JSON in this exact shape:
{
  "sourceLang": "<language name in English>",
  "items": [
    { "translation": "...", "sourcePinyin": ["..."] | null, "translationPinyin": ["..."] | null },
    ...
  ]
}
Keep the items array in the SAME order as ITEMS.

ITEMS:
${list}`;
    let result: any;
    try {
      result = await callLovableAI({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output only valid JSON. No prose." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
    } catch (e) {
      return empty(e instanceof Error ? e.message : String(e));
    }
    const content = result?.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      sourceLang?: string;
      items?: {
        translation?: string;
        sourcePinyin?: string[] | null;
        translationPinyin?: string[] | null;
      }[];
      translations?: string[]; // backwards-compat fallback
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const items = parsed.items ?? [];
    const translations: string[] = [];
    const sourcePinyin: (string[] | null)[] = [];
    const translationPinyin: (string[] | null)[] = [];
    for (let i = 0; i < data.words.length; i++) {
      const it = items[i] ?? {};
      translations.push((it.translation ?? parsed.translations?.[i] ?? "").toString());
      sourcePinyin.push(Array.isArray(it.sourcePinyin) ? it.sourcePinyin : null);
      translationPinyin.push(Array.isArray(it.translationPinyin) ? it.translationPinyin : null);
    }
    return {
      sourceLang: parsed.sourceLang ?? "Unknown",
      translations,
      sourcePinyin,
      translationPinyin,
      error: null as string | null,
    };
  });


async function callLovableAI(body: unknown): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 402 || t.toLowerCase().includes("not enough credits") || t.toLowerCase().includes("payment_required")) {
      throw new Error("AI credits exhausted. Please add credits in your workspace billing to continue using AI features.");
    }
    if (res.status === 429) {
      throw new Error("AI rate limit reached. Please wait a moment and try again.");
    }
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  return res.json();
}

export const extractWordsFromText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = `You are an English vocabulary extractor. From the user's text, extract up to ${data.maxWords} useful English vocabulary words or short phrases (1-3 words each). Return ONLY a strict JSON object: {"words":[{"word":"...","ipa":"..."}]}. Provide accurate IPA phonetic transcription for each word. Skip duplicates, numbers, and meaningless tokens.\n\nTEXT:\n${data.text.slice(0, 60_000)}`;

    const result = await callLovableAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You output only valid JSON. No prose." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = result?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { words?: { word: string; ipa?: string }[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to salvage JSON from a fenced block
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { words: [] };
    }
    const words = (parsed.words ?? [])
      .filter((w) => w && typeof w.word === "string" && w.word.trim().length > 0)
      .slice(0, data.maxWords)
      .map((w) => ({ word: w.word.trim(), ipa: (w.ipa ?? "").trim() }));
    return { words };
  });

const TopicInput = z.object({
  topic: z.string().min(1).max(200),
  count: z.number().min(1).max(2000).default(20),
});

export const generateWordsForTopic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TopicInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = `Generate ${data.count} useful English vocabulary words or short phrases (1-3 words) for the topic/field: "${data.topic}". Return ONLY strict JSON: {"words":[{"word":"...","ipa":"..."}]}. Include accurate IPA. No duplicates, no numbering, no extra prose.`;
    const result = await callLovableAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You output only valid JSON. No prose." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const content = result?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { words?: { word: string; ipa?: string }[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { words: [] };
    }
    const words = (parsed.words ?? [])
      .filter((w) => w && typeof w.word === "string" && w.word.trim().length > 0)
      .slice(0, data.count)
      .map((w) => ({ word: w.word.trim(), ipa: (w.ipa ?? "").trim() }));
    return { words };
  });

const ExampleInput = z.object({ word: z.string().min(1).max(120) });

export const generateExampleSentence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExampleInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = `Write ONE short, natural English example sentence (max 14 words) that uses the word/phrase "${data.word}". Return ONLY strict JSON: {"sentence":"..."}.`;
    const result = await callLovableAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You output only valid JSON. No prose." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const content = result?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { sentence?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    return { sentence: (parsed.sentence ?? "").toString().trim() };
  });

export const IMAGE_STYLES = {
  cartoon:
    "Flat cartoon illustration, simple friendly characters, clear visual metaphor, light teal/mint background, soft pastel colors, thick clean outlines, centered composition",
  realistic:
    "Photorealistic photograph, natural lighting, high detail, shallow depth of field, real-world setting, centered subject",
  watercolor:
    "Soft watercolor painting, gentle brush strokes, paper texture, muted pastel palette, hand-painted look, centered composition",
  "3d":
    "Cute 3D render, Pixar-style, soft global illumination, glossy materials, pastel background, centered subject",
  pixel:
    "Retro 16-bit pixel art, limited color palette, crisp pixels, simple background, centered subject",
  line:
    "Minimal black line drawing on white background, clean thin strokes, no shading, single accent color, centered subject",
  anime:
    "Anime / manga illustration, expressive characters, cel shading, vibrant colors, soft background, centered composition",
  sketch:
    "Pencil sketch, hand-drawn, hatching and shading, off-white paper background, centered subject",
} as const;

export type ImageStyle = keyof typeof IMAGE_STYLES;

const ImageInput = z.object({
  word: z.string().min(1).max(120),
  style: z
    .enum(["cartoon", "realistic", "watercolor", "3d", "pixel", "line", "anime", "sketch"])
    .default("cartoon"),
});

export const generateVocabImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const styleDesc = IMAGE_STYLES[data.style];
    const prompt = `${styleDesc}, representing the English word/phrase "${data.word}". No text or letters in the image.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 402 || t.toLowerCase().includes("not enough credits") || t.toLowerCase().includes("payment_required")) {
        throw new Error("AI credits exhausted. Please add credits in your workspace billing to continue using AI features.");
      }
      if (res.status === 429) {
        throw new Error("AI rate limit reached. Please wait a moment and try again.");
      }
      throw new Error(`Image gen ${res.status}: ${t}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    return { dataUrl: `data:image/png;base64,${b64}` };
  });
