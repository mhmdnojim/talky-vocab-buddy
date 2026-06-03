CREATE TABLE public.custom_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📚',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_words (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.custom_categories(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  ipa TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_words_category ON public.custom_words(category_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_categories TO anon, authenticated;
GRANT ALL ON public.custom_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_words TO anon, authenticated;
GRANT ALL ON public.custom_words TO service_role;

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read categories" ON public.custom_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert categories" ON public.custom_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public delete categories" ON public.custom_categories FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Public read words" ON public.custom_words FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert words" ON public.custom_words FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update words" ON public.custom_words FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete words" ON public.custom_words FOR DELETE TO anon, authenticated USING (true);