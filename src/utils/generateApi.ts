import { supabase } from './supabase'
import { logTimed } from './logger'

export interface GenerateResponse {
  success: true
  id: string
}

export interface GenerateErrorResponse {
  error: string
}

export interface RateLimitErrorResponse {
  error: string
  retryAfterSeconds: number
}

export async function generateArchiveGame(
  rounds: number,
  categoriesPerRound: number,
  gameName: string
): Promise<GenerateResponse | GenerateErrorResponse> {
  const timer = logTimed('generation', 'generateArchiveGame', { rounds, categoriesPerRound, gameName });
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    timer.done({ success: false, error: 'Not authenticated' });
    return { error: 'Not authenticated' };
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-archive-game`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rounds, categoriesPerRound, gameName }),
    }
  )

  const result = await res.json();
  if ('error' in result) {
    timer.done({ success: false, error: result.error });
  } else {
    timer.done({ success: true });
  }
  return result;
}

export async function generateLabsGame(
  keywords: string[],
  gameName: string
): Promise<GenerateResponse | GenerateErrorResponse> {
  const timer = logTimed('generation', 'generateLabsGame', { keywords, gameName });
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    timer.done({ success: false, error: 'Not authenticated' });
    return { error: 'Not authenticated' };
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-labs-game`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ keywords, gameName }),
    }
  )

  const result = await res.json();
  if ('error' in result) {
    timer.done({ success: false, error: result.error });
  } else {
    timer.done({ success: true });
  }
  return result;
}

export interface GenerateAiGameParams {
  rounds: number
  categoriesPerRound: number
  difficulty: number
  dailyDoublesPerRound: number
  specialRequests: string
  gameName: string
}

export async function generateAiGame(
  params: GenerateAiGameParams
): Promise<GenerateResponse | GenerateErrorResponse | RateLimitErrorResponse> {
  const timer = logTimed('generation', 'generateAiGame', { gameName: params.gameName, difficulty: params.difficulty, rounds: params.rounds });
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    timer.done({ success: false, error: 'Not authenticated' });
    return { error: 'Not authenticated' };
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ai-game`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    }
  )

  const result = await res.json();
  if ('error' in result) {
    timer.done({ success: false, error: result.error });
  } else {
    timer.done({ success: true });
  }
  return result;
}
