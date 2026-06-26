import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    console.log('delete-user: function invoked')

    // Auth validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Service role client bypasses RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      console.log('delete-user: token verification failed', userError?.message)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { userId, playerId } = await req.json()

    // Security: only allow users to delete their own account
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: can only delete your own account' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    console.log('delete-user: starting deletion for', userId)

    // Step 1: Delete all game rows for this player (bypasses RLS)
    if (playerId) {
      const { error: gamesErr } = await supabase
        .from('games')
        .delete()
        .eq('created_by', playerId)
      if (gamesErr) {
        console.log('delete-user: failed to delete games', gamesErr.message)
        return new Response(JSON.stringify({ error: 'Failed to delete games', failedStep: 'delete_games' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    // Step 2: Delete storage files under the user's auth UUID folder
    const { data: files } = await supabase.storage.from('games').list(userId)
    if (files && files.length > 0) {
      const filePaths = files.map((f: { name: string }) => `${userId}/${f.name}`)
      await supabase.storage.from('games').remove(filePaths)
    }

    // Step 3: Delete the player record (bypasses RLS — removes FK reference)
    if (playerId) {
      const { error: playerErr } = await supabase
        .from('players')
        .delete()
        .eq('id', playerId)
      if (playerErr) {
        console.log('delete-user: failed to delete player', playerErr.message)
        return new Response(JSON.stringify({ error: 'Failed to delete player record', failedStep: 'delete_player' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    // Step 4: Delete the auth user via GoTrue Admin API
    const gotruePath = `${supabaseUrl}/auth/v1/admin/users/${userId}`
    const deleteRes = await fetch(gotruePath, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
    })

    if (!deleteRes.ok) {
      const errorBody = await deleteRes.text()
      console.log('delete-user: GoTrue delete failed', deleteRes.status, errorBody)
      return new Response(
        JSON.stringify({ error: `Failed to delete auth account: ${errorBody || deleteRes.statusText}` }),
        {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('delete-user: success')
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    console.log('delete-user: caught error', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
