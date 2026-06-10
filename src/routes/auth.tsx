import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import { AuthContext } from '../contexts/AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setSession(session)
      if (event === 'SIGNED_OUT') {
        setSignedOut(true)
      }
    })

    return () => {
      mounted = false
      data.subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, signedOut }}>
      {children}
    </AuthContext.Provider>
  )
}
