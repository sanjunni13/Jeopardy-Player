import { supabase } from './supabase'

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
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: 'Not authenticated' }

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

  return res.json()
}

export async function generateLabsGame(
  keywords: string[],
  gameName: string
): Promise<GenerateResponse | GenerateErrorResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: 'Not authenticated' }

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

  return res.json()
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
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: 'Not authenticated' }

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

  return res.json()
}
