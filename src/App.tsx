import { useEffect, useState, type FormEvent } from "react"
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react"
import { Home } from "@/Home"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const sessionStorageKey = "uno-auth-session"

type AuthSession = {
  access_token: string
  refresh_token: string
  expires_at?: number
  expires_in?: number
  user: { id: string; email?: string; user_metadata?: { username?: string } }
}

async function authRequest(path: string, body: object): Promise<AuthSession | { id: string }> {
  if (!supabaseUrl || !supabaseKey) throw new Error("Connect Supabase by setting VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in uno-frontend/.env.local.")
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseKey },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Authentication failed. Please try again.")
  return data
}

type Mode = "login" | "register"

function App() {
  const [mode, setMode] = useState<Mode>("login")
  const [session, setSession] = useState<AuthSession | null>(() => {
    try { return JSON.parse(localStorage.getItem(sessionStorageKey) || "null") as AuthSession | null } catch { return null }
  })
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!session) return
    const refreshSession = async () => {
      try {
        const refreshed = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token }) as AuthSession
        const nextSession = { ...refreshed, expires_at: Date.now() / 1000 + (refreshed.expires_in ?? 3600) }
        localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
        setSession(nextSession)
      } catch {
        localStorage.removeItem(sessionStorageKey)
        setSession(null)
      }
    }
    if ((session.expires_at ?? 0) * 1000 < Date.now() + 60_000) void refreshSession()
    const timer = window.setInterval(() => {
      if ((session.expires_at ?? 0) * 1000 < Date.now() + 60_000) void refreshSession()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [session])

  function switchMode(next: Mode) {
    setMode(next)
    setError("")
    setMessage("")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setBusy(true)
    try {
      if (mode === "register") {
        const data = await authRequest("signup", {
          email: email.trim(),
          password,
          data: { username: username.trim() },
        }) as AuthSession
        if (data.access_token) {
          const nextSession = { ...data, expires_at: Date.now() / 1000 + (data.expires_in ?? 3600) }
          localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
          setSession(nextSession)
          setMessage("Your account is ready. Welcome to the table!")
        } else setMessage("Account created. Check your email to confirm your address, then sign in.")
      } else {
        const data = await authRequest("token?grant_type=password", { email: email.trim(), password }) as AuthSession
        const nextSession = { ...data, expires_at: Date.now() / 1000 + (data.expires_in ?? 3600) }
        localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
        setSession(nextSession)
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    localStorage.removeItem(sessionStorageKey)
    setSession(null)
    setMessage("You’ve been signed out.")
  }

  if (session) return <Home session={session} onSignOut={signOut} />

  return (
    <main className="auth-shell">
      <section className="story-panel" aria-label="UNO No Mercy">
        <div className="story-top"><div className="brand-mark">U<span>!</span></div><span className="brand-name">NO MERCY</span></div>
        <div className="story-content">
          <p className="eyebrow"><Sparkles size={14} /> THE CLASSIC, TURNED UP</p>
          <h1>Make your<br />move.</h1>
          <p className="story-copy">The table is waiting. Rally your friends, play your cards, and show no mercy.</p>
          <div className="card-stack" aria-hidden="true">
            <img className="uno-card card-blue" src="/uno/B_d2.svg" />
            <img className="uno-card card-yellow" src="/uno/Y_n7.svg" />
            <img className="uno-card card-red" src="/uno/R_w4r.svg" />
          </div>
        </div>
        <div className="story-footer"><span className="online-dot" /> READY WHEN YOU ARE <span className="footer-separator">·</span> NO MERCY RULES</div>
      </section>

      <section className="form-panel">
        <div className="form-wrap">
          <div className="mobile-brand"><div className="brand-mark">U<span>!</span></div><span className="brand-name">NO MERCY</span></div>
          <p className="eyebrow form-eyebrow">WELCOME TO THE GAME</p>
          <h2>{mode === "login" ? "Good to see you." : "Join the table."}</h2>
          <p className="form-subtitle">{mode === "login" ? "Sign in and pick up where the fun starts." : "Create your player account. The cards are waiting."}</p>

          <div className="mode-switch" role="tablist" aria-label="Account action">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button>
            <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Create account</button>
          </div>

          <form onSubmit={submit}>
            {mode === "register" && <label className="field-label">Player name<div className="input-wrap"><UserRound size={17} /><input autoComplete="nickname" required minLength={2} maxLength={24} value={username} onChange={e => setUsername(e.target.value)} placeholder="What should we call you?" /></div></label>}
            <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div></label>
            <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /><button type="button" className="visibility-button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {error && <p className="notice error-notice" role="alert">{error}</p>}
            {message && <p className="notice success-notice" role="status">{message}</p>}
            <button className="submit-button" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
          </form>
          <p className="switch-copy">{mode === "login" ? "New around here?" : "Already have an account?"} <button className="inline-link" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
          <p className="terms-copy">By continuing, you agree to play fair and have fun.</p>
        </div>
      </section>
    </main>
  )
}

export default App
