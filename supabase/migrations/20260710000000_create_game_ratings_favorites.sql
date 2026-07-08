-- Create game_ratings table for storing player ratings (1-5 stars) per game
CREATE TABLE game_ratings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id   bigint NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id     bigint NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  rating      integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, game_id)
);

-- Create game_favorites table for storing player bookmarked games
CREATE TABLE game_favorites (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id   bigint NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id     bigint NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, game_id)
);

-- Indexes for game_ratings
CREATE INDEX idx_game_ratings_player_game ON game_ratings(player_id, game_id);
CREATE INDEX idx_game_ratings_game_id ON game_ratings(game_id);

-- Indexes for game_favorites
CREATE INDEX idx_game_favorites_player_id ON game_favorites(player_id);
CREATE INDEX idx_game_favorites_player_game ON game_favorites(player_id, game_id);

-- Enable Row Level Security
ALTER TABLE game_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_favorites ENABLE ROW LEVEL SECURITY;

-- Grant table privileges to authenticated and anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON game_ratings TO authenticated;
GRANT SELECT, INSERT, DELETE ON game_favorites TO authenticated;
GRANT SELECT ON game_ratings TO anon;
GRANT SELECT ON game_favorites TO anon;

-- RLS Policies for game_ratings
CREATE POLICY "Authenticated users can read all ratings"
  ON game_ratings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own ratings"
  ON game_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid())
  );

CREATE POLICY "Users can update own ratings"
  ON game_ratings FOR UPDATE
  TO authenticated
  USING (player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid()))
  WITH CHECK (player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid()));

CREATE POLICY "Users can delete own ratings"
  ON game_ratings FOR DELETE
  TO authenticated
  USING (player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid()));

-- RLS Policies for game_favorites
CREATE POLICY "Authenticated users can read all favorites"
  ON game_favorites FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own favorites"
  ON game_favorites FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid())
  );

CREATE POLICY "Users can delete own favorites"
  ON game_favorites FOR DELETE
  TO authenticated
  USING (player_id = (SELECT id FROM players WHERE auth_uuid = auth.uid()));
