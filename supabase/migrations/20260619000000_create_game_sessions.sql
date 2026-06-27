-- Create game_sessions table for real-time buzzer and Final Jeopardy session management
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,                    -- 22+ char cryptographically secure ID
  host_user_id UUID REFERENCES auth.users(id),
  game_id TEXT NOT NULL,                  -- references existing games table
  phase TEXT NOT NULL DEFAULT 'lobby',    -- lobby | buzzer | final-jeopardy | ended
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  players JSONB NOT NULL DEFAULT '[]',    -- array of { name, score, joinedAt }
  buzz_state JSONB NOT NULL DEFAULT '{}', -- { active, queue, lockedOut, clueActive }
  final_jeopardy_state JSONB NOT NULL DEFAULT '{}', -- { submissions, revealedIndex }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on host_user_id for looking up sessions by host
CREATE INDEX idx_game_sessions_host_user_id ON game_sessions (host_user_id);

-- Index on game_id for looking up sessions by game
CREATE INDEX idx_game_sessions_game_id ON game_sessions (game_id);

-- Enable Row Level Security
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: hosts can manage their own sessions
CREATE POLICY "Hosts can manage their own sessions"
  ON game_sessions
  FOR ALL
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

-- Policy: anyone can read sessions (players access via session link without auth)
CREATE POLICY "Anyone can read sessions"
  ON game_sessions
  FOR SELECT
  USING (true);

-- Policy: anyone can update sessions (players need to register/submit without auth)
CREATE POLICY "Anyone can update sessions"
  ON game_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable Realtime for the game_sessions table
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
