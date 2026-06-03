// Server functions for AI-powered vocabulary extraction and image generation.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ExtractInput = z.object({
  text: z.string().min(1).max(200_000),
  maxWords: z.number().min(1).max(200).default(50),
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

const ImageInput = z.object({ word: z.string().min(1).max(120) });

export const generateVocabImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `Flat cartoon illustration representing the English word/phrase "${data.word}". Simple, friendly characters, clear visual metaphor, light teal/mint background, soft pastel colors, thick clean outlines, centered composition, no text or letters in the image.`;

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
      throw new Error(`Image gen ${res.status}: ${t}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    return { dataUrl: `data:image/png;base64,${b64}` };
  });
