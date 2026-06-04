ALTER TABLE public.custom_words ADD COLUMN IF NOT EXISTS example text DEFAULT '' NOT NULL;
ALTER TABLE public.custom_words ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.custom_categories ADD COLUMN IF NOT EXISTS words_per_patch integer NOT NULL DEFAULT 20;