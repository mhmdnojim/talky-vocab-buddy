// Speaks a word. Tries ElevenLabs server route first (multilingual);
// falls back to browser speechSynthesis on any failure.

const audioCache = new Map<string, string>(); // key: lang|text -> object URL

async function tryServerTTS(text: string, lang: string): Promise<string | null> {
  try {
    const key = `${lang}|${text}`;
    const cached = audioCache.get(key);
    if (cached) return cached;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const url = URL.createObjectURL(blob);
    audioCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

function browserSpeak(text: string, lang: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (match) utter.voice = match;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export async function speak(
  text: string,
  opts?: { slow?: boolean; lang?: string },
): Promise<void> {
  const lang = opts?.lang ?? "en-US";
  const url = await tryServerTTS(text, lang);
  if (url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = opts?.slow ? 0.6 : 1;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }
  return browserSpeak(text, lang, opts?.slow ? 0.55 : 0.95);
}

// Map a target-language label (as used in the language picker) to a BCP-47 tag.
const LANG_TO_BCP47: Record<string, string> = {
  Arabic: "ar-SA",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Italian: "it-IT",
  Portuguese: "pt-PT",
  Russian: "ru-RU",
  Chinese: "zh-CN",
  Japanese: "ja-JP",
  Korean: "ko-KR",
  Hindi: "hi-IN",
  Turkish: "tr-TR",
  Dutch: "nl-NL",
  Polish: "pl-PL",
  Swedish: "sv-SE",
  English: "en-US",
};

export function langLabelToBcp47(label: string): string {
  return LANG_TO_BCP47[label] ?? "en-US";
}
