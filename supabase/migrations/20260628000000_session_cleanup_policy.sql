-- Allow authenticated users to delete ended sessions older than 24 hours
-- This enables the client-side cleanupStaleSessions() to remove old sessions
-- from any host, not just their own.
CREATE POLICY "Authenticated users can delete old ended sessions"
  ON game_sessions
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND phase = 'ended'
    AND updated_at < (NOW() - INTERVAL '24 hours')
  );
