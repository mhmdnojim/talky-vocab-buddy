import { createFileRoute } from "@tanstack/react-router";

// TTS proxy: tries ElevenLabs if ELEVENLABS_API_KEY is set, otherwise
// returns 503 so the client can fall back to browser speechSynthesis.

const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah - clear English voice

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response("ElevenLabs not configured", { status: 503 });
        }

        let body: { text?: string; lang?: string };
        try {
          body = (await request.json()) as { text?: string; lang?: string };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text || "").trim();
        const lang = (body.lang || "en-US").toLowerCase();
        if (!text || text.length > 200) {
          return new Response("Invalid text", { status: 400 });
        }
        // Use the multilingual model for anything that isn't plain English so
        // Chinese / Arabic / etc. are pronounced correctly.
        const model_id = lang.startsWith("en")
          ? "eleven_turbo_v2_5"
          : "eleven_multilingual_v2";

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              model_id,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.3,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          return new Response(errText || "TTS failed", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
