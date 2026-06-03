# Vocabulary Learning App

A flashcard-style vocabulary app inspired by "English Fun Easy Learn" with cartoon illustrations and human-quality pronunciation.

## Visual design
- Green header bar matching the reference (back, title "Vocabulary", play/menu)
- Large illustration card with star (favorite) and side arrows (prev/next swipe)
- Word + speaker icon below image, IPA phonetic line at the bottom
- Big circular speaker button to replay pronunciation
- Mobile-first, works on desktop too

## Features (v1)
1. **Vocabulary deck** — start with ~50 hand-picked everyday words across categories (Emergency, Daily Life, Greetings, Food, Travel). Structure scales to 5,000 later by just adding entries to the data file.
2. **Card view** — image + word + IPA phonetic spelling
3. **Pronunciation**
   - Primary: ElevenLabs TTS (natural human-like voice) via server route
   - Fallback: browser `speechSynthesis` (free, offline) if API unavailable or fails
   - Audio is cached per-word in memory so replays are instant and don't re-bill
4. **Navigation** — prev/next arrows, swipe on mobile, keyboard arrows on desktop
5. **Favorites** — star toggle, stored in localStorage
6. **Categories** — simple filter chips at the top
7. **Auto-play** — top-right play button cycles through cards reading each aloud

## AI-generated illustrations
- One cartoon image per vocabulary word, generated with `imagegen` in the style of the reference (flat cartoon characters, speech bubble showing the concept, light teal background)
- For the v1 starter set (~50 words) I'll generate all images up front and save under `src/assets/vocab/`
- Scaling to 5,000 words: would need a separate batch generation pass — out of scope for this first build, but the data structure supports it

## Technical
- TanStack Start routes:
  - `/` — category selection / home
  - `/learn/$category` — flashcard view
- Server route `src/routes/api/tts.ts` — proxies ElevenLabs TTS, returns MP3 bytes. Reads `ELEVENLABS_API_KEY` from secrets.
- Client TTS helper: tries `/api/tts` first; on any error (missing key, 402, network), falls back to `window.speechSynthesis` with `en-US` voice
- Vocabulary data: `src/data/vocabulary.ts` — array of `{ id, word, ipa, category, image }`
- localStorage for favorites
- Tokens in `src/styles.css`: green primary matching reference, rounded cards, soft shadows

## What I'll need from you after the plan
- ElevenLabs API key (I'll prompt for it after starting) — optional; without it the app still works with the free browser voice

## Out of scope for v1
- Full 5,000-word dataset (start with 50, expandable)
- Microphone speech-recognition practice (the mic button in the reference) — can add later
- User accounts / cross-device sync
