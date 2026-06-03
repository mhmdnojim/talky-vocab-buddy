// Speaks a word. Tries ElevenLabs server route first; falls back to
// browser speechSynthesis on any failure (missing key, 5xx, offline).

const audioCache = new Map<string, string>(); // text -> object URL

async function tryServerTTS(text: string): Promise<string | null> {
  try {
    const cached = audioCache.get(text);
    if (cached) return cached;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const url = URL.createObjectURL(blob);
    audioCache.set(text, url);
    return url;
  } catch {
    return null;
  }
}

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.95;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.startsWith("en"));
    if (en) utter.voice = en;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export async function speak(text: string, opts?: { slow?: boolean }): Promise<void> {
  const url = await tryServerTTS(text);
  if (url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = opts?.slow ? 0.6 : 1;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }
  // Fallback
  if (opts?.slow && typeof window !== "undefined" && "speechSynthesis" in window) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 0.55;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }
  return browserSpeak(text);
}
