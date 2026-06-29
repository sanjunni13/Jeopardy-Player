import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sessions inactive for this long are marked as ended
const STALE_TIMEOUT_MINUTES = 30

// Ended sessions older than this are deleted entirely
const DELETE_AFTER_HOURS = 24

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()

    // Step 1: Mark stale active sessions as ended
    // Any session not in 'ended' phase that hasn't been updated in 30 minutes
    const staleThreshold = new Date(now.getTime() - STALE_TIMEOUT_MINUTES * 60 * 1000).toISOString()

    const { data: staleSessions, error: staleErr } = await supabase
      .from('game_sessions')
      .update({ phase: 'ended', updated_at: now.toISOString() })
      .neq('phase', 'ended')
      .lt('updated_at', staleThreshold)
      .select('id')

    if (staleErr) {
      console.error('cleanup-sessions: failed to mark stale sessions', staleErr.message)
    }

    const staleCount = staleSessions?.length ?? 0

    // Step 2: Delete ended sessions older than 24 hours
    const deleteThreshold = new Date(now.getTime() - DELETE_AFTER_HOURS * 60 * 60 * 1000).toISOString()

    const { data: deletedSessions, error: deleteErr } = await supabase
      .from('game_sessions')
      .delete()
      .eq('phase', 'ended')
      .lt('updated_at', deleteThreshold)
      .select('id')

    if (deleteErr) {
      console.error('cleanup-sessions: failed to delete old sessions', deleteErr.message)
    }

    const deletedCount = deletedSessions?.length ?? 0

    console.log(`cleanup-sessions: marked ${staleCount} stale, deleted ${deletedCount} old`)

    return new Response(
      JSON.stringify({
        success: true,
        staleSessionsEnded: staleCount,
        oldSessionsDeleted: deletedCount,
      }),
      {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    console.error('cleanup-sessions: caught error', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
