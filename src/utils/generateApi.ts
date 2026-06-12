import { supabase } from './supabase'

export interface GenerateResponse {
  success: true
  id: string
}

export interface GenerateErrorResponse {
  error: string
}

export interface UpdateArchiveResponse {
  success: true
  message: string
  lastUpdated: string
}

export async function generateArchiveGame(
  rounds: number,
  categoriesPerRound: number
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
      body: JSON.stringify({ rounds, categoriesPerRound }),
    }
  )

  return res.json()
}

export async function updateArchiveData(): Promise<UpdateArchiveResponse | GenerateErrorResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: 'Not authenticated' }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-archive-data`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }
  )

  return res.json()
}

export async function generateLabsGame(
  keywords: string[]
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
      body: JSON.stringify({ keywords }),
    }
  )

  return res.json()
}

export async function getArchiveLastUpdated(): Promise<{ lastUpdated: string | null }> {
  const { data, error } = await supabase.storage
    .from('data')
    .download('category_analysis/last_updated.json')
  if (error || !data) return { lastUpdated: null }
  const json = JSON.parse(await data.text())
  return { lastUpdated: json.lastUpdated ?? null }
}
