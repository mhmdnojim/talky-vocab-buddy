-- Wipe existing unowned data (demo content with no owner)
DELETE FROM public.custom_words;
DELETE FROM public.custom_categories;

-- Add owner columns
ALTER TABLE public.custom_categories
  ADD COLUMN user_id UUID NOT NULL;
ALTER TABLE public.custom_words
  ADD COLUMN user_id UUID NOT NULL;

CREATE INDEX idx_custom_categories_user ON public.custom_categories(user_id);
CREATE INDEX idx_custom_words_user ON public.custom_words(user_id);

-- Drop old permissive policies
DROP POLICY IF EXISTS "Public read categories" ON public.custom_categories;
DROP POLICY IF EXISTS "Public insert categories" ON public.custom_categories;
DROP POLICY IF EXISTS "Public delete categories" ON public.custom_categories;

DROP POLICY IF EXISTS "Public read words" ON public.custom_words;
DROP POLICY IF EXISTS "Public insert words" ON public.custom_words;
DROP POLICY IF EXISTS "Public update words" ON public.custom_words;
DROP POLICY IF EXISTS "Public delete words" ON public.custom_words;

-- Tighten grants: revoke anon, keep authenticated + service_role
REVOKE ALL ON public.custom_categories FROM anon;
REVOKE ALL ON public.custom_words FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_words TO authenticated;
GRANT ALL ON public.custom_categories TO service_role;
GRANT ALL ON public.custom_words TO service_role;

-- Owner-scoped RLS
CREATE POLICY "Users view own categories"
  ON public.custom_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own categories"
  ON public.custom_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own categories"
  ON public.custom_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own categories"
  ON public.custom_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own words"
  ON public.custom_words FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own words"
  ON public.custom_words FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own words"
  ON public.custom_words FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own words"
  ON public.custom_words FOR DELETE TO authenticated
  USING (auth.uid() = user_id);