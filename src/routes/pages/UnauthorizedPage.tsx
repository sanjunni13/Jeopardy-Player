import { Link } from '@tanstack/react-router'

export function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center">
      <div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900/95 p-10 text-center shadow-2xl shadow-slate-900/30">
        <h1 className="text-5xl font-bold text-rose-400 mb-4">401</h1>
        <p className="text-slate-300 mb-6">Unauthorized or unauthenticated access detected.</p>
        <Link to="/login" className="inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          Go to Login
        </Link>
      </div>
    </main>
  )
}
