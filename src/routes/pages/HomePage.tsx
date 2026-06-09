import { useAuth } from '../auth'

export function HomePage() {
  const { session } = useAuth()

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-10 shadow-2xl shadow-slate-900/30">
        <h1 className="text-4xl font-bold mb-4">Home</h1>
        <p className="text-slate-400 mb-6">
          Welcome to the home page. You are authenticated with Supabase and can now add protected routes under <code>/home</code>.
        </p>
        <div className="rounded-2xl bg-slate-950 p-6 border border-slate-800">
          <p className="text-slate-300">User ID:</p>
          <p className="font-mono text-slate-100 break-all">{session?.user.id}</p>
        </div>
      </div>
    </div>
  )
}
