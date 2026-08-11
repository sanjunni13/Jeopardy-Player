import { supabase } from './supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
}

export interface ChatErrorResponse {
  error: string
}

/**
 * Sends a conversation to the builder-chatbot edge function and returns
 * the assistant's reply.
 */
export async function sendChatMessage(
  messages: ChatMessage[]
): Promise<ChatResponse | ChatErrorResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    return { error: 'Not authenticated' }
  }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/builder-chatbot`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages }),
      }
    )

    const result = await res.json()
    if (!res.ok || 'error' in result) {
      return { error: result.error || 'Something went wrong' }
    }

    return result as ChatResponse
  } catch {
    return { error: 'Network error. Please try again.' }
  }
}
