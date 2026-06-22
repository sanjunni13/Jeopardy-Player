-- Create the drafts table for storing custom game builder draft metadata
CREATE TABLE public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- RLS policies: scope all operations to the authenticated user's email
CREATE POLICY "Users can select their own drafts"
  ON public.drafts FOR SELECT
  USING (created_by = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert their own drafts"
  ON public.drafts FOR INSERT
  WITH CHECK (created_by = auth.jwt() ->> 'email');

CREATE POLICY "Users can update their own drafts"
  ON public.drafts FOR UPDATE
  USING (created_by = auth.jwt() ->> 'email');

CREATE POLICY "Users can delete their own drafts"
  ON public.drafts FOR DELETE
  USING (created_by = auth.jwt() ->> 'email');

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.drafts TO authenticated;
