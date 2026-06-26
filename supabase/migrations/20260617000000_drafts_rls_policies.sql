-- This migration ensures RLS policies are correctly set on the drafts table.
-- It drops any existing policies first to avoid conflicts, then recreates them.

-- Drop existing policies (safe if they don't exist)
DROP POLICY IF EXISTS "Users can select their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can insert their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can update their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can select own drafts" ON drafts;
DROP POLICY IF EXISTS "Users can insert own drafts" ON drafts;
DROP POLICY IF EXISTS "Users can update own drafts" ON drafts;
DROP POLICY IF EXISTS "Users can delete own drafts" ON drafts;

-- Enable Row Level Security on the drafts table (idempotent)
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only read their own drafts
CREATE POLICY "Users can select own drafts"
  ON public.drafts FOR SELECT
  USING (auth.uid() = created_by);

-- INSERT: users can only insert rows where created_by matches their auth uid
CREATE POLICY "Users can insert own drafts"
  ON public.drafts FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- UPDATE: users can only update their own drafts
CREATE POLICY "Users can update own drafts"
  ON public.drafts FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- DELETE: users can only delete their own drafts
CREATE POLICY "Users can delete own drafts"
  ON public.drafts FOR DELETE
  USING (auth.uid() = created_by);

-- Grant table access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.drafts TO authenticated;

-- Ensure storage.objects has an UPDATE policy for the games bucket
-- (needed for upsert operations on existing files)
CREATE POLICY "Update Games for Auth Users 1mf269_3"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'games'::text);
