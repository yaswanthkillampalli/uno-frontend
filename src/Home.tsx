import { useEffect, useRef, useState, type FormEvent } from "react"
import { io, type Socket } from "socket.io-client"
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Copy, Crown, LogOut, Plus, Radio, Users } from "lucide-react"
import { GameTable, type GamePayload } from "@/GameTable"

type Session = {
  access_token: string
  user: { id: string; email?: string; user_metadata?: { username?: string } }
}

type Player = { userId: string; username: string; seat: number; isReady: boolean; connected: boolean }
type Room = {
  code: string
  phase: "lobby" | "playing"
  hostId: string
  maxPlayers: number
  settings: { sevenZero: boolean; turnSeconds: number; lifelines: number }
  players: Player[]
  hasGame: boolean
}
type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; code: string; message: string }

const serverUrl = import.meta.env.VITE_GAME_SERVER_URL || "http://localhost:3001"

export function Home({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const [game, setGame] = useState<GamePayload | null>(null)
  const [joinCode, setJoinCode] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [sevenZero, setSevenZero] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const username = session.user.user_metadata?.username || session.user.email?.split("@")[0] || "Player"
  const me = room?.players.find(player => player.userId === session.user.id)
  const isHost = room?.hostId === session.user.id
  const canStart = !!room && room.players.length >= 2 && room.players.every(player => player.isReady && player.connected)

  useEffect(() => {
    const nextSocket = io(serverUrl, { auth: callback => callback({ token: session.access_token }) })
    socketRef.current = nextSocket
    nextSocket.on("connect", () => { setConnected(true); setError("") })
    nextSocket.on("disconnect", () => setConnected(false))
    nextSocket.on("connect_error", err => {
      setConnected(false)
      setError(err.message === "UNAUTHORIZED" ? "Your sign-in expired. Sign out and sign in again." : `Could not connect to the game server at ${serverUrl}.`)
    })
    nextSocket.on("session:restore", (data: { room: Room | null; game: GamePayload | null }) => { setRoom(data.room); setGame(data.game ? { ...data.game, clockOffset: data.game.serverNow - Date.now() } : null) })
    nextSocket.on("room:state", (nextRoom: Room) => setRoom(nextRoom))
    nextSocket.on("game:update", (nextGame: GamePayload) => setGame({ ...nextGame, clockOffset: nextGame.serverNow - Date.now() }))
    nextSocket.on("room:left", () => { setRoom(null); setGame(null); setNotice("You left the table.") })
    return () => { nextSocket.disconnect(); socketRef.current = null }
  }, [session.access_token])

  async function send<T>(event: string, payload?: object): Promise<T | undefined> {
    const socket = socketRef.current
    if (!socket?.connected) { setError("Connecting to the game server… try again in a moment."); return }
    setBusy(true); setError(""); setNotice("")
    try {
      const response = payload === undefined
        ? await socket.emitWithAck(event) as Ack<T>
        : await socket.emitWithAck(event, payload) as Ack<T>
      if (!response.ok) throw new Error(response.message)
      return response.data ?? true as T
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The request failed. Please try again.")
      return undefined
    } finally { setBusy(false) }
  }

  async function createRoom() {
    const created = await send<Room>("room:create", { maxPlayers, settings: { sevenZero, turnSeconds: 20, lifelines: 3 } })
    if (created) setRoom(created)
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const joined = await send<Room>("room:join", { code: joinCode.trim().toUpperCase() })
    if (joined) { setRoom(joined); setJoinCode("") }
  }

  async function leaveRoom() {
    await send("room:leave")
    setRoom(null)
    setGame(null)
  }

  async function setReady(ready: boolean) {
    await send("room:ready", { ready })
  }

  async function startGame() {
    const started = await send("room:start")
    if (started !== undefined) setNotice("Game started. The game table is ready.")
  }

  async function copyCode() {
    if (!room) return
    await navigator.clipboard.writeText(room.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <main className="home-shell">
      <header className="home-header">
        <a className="home-brand" href="#home"><span className="brand-mark">U<span>!</span></span><span>NO MERCY</span></a>
        <div className="header-right"><span className={`connection-pill ${connected ? "is-online" : ""}`}><span />{connected ? "Connected" : "Connecting"}</span><div className="profile-chip"><span className="avatar">{username.slice(0, 1).toUpperCase()}</span><span>{username}</span></div><button className="icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
      </header>

      <section className="home-main">
        {(!room || !game) && <div className="home-heading"><p className="eyebrow"><Radio size={14} /> YOUR NEXT ROUND STARTS HERE</p><h1>Ready to play,<br /><span>{username}?</span></h1><p>Gather your crew or jump into a game with a room code.</p></div>}

        {error && <div className="home-alert error-notice" role="alert">{error}</div>}
        {notice && <div className="home-alert success-notice" role="status">{notice}</div>}

        {room && game ? (
          <GameTable room={room} payload={game} userId={session.user.id} onAction={send} onLeave={leaveRoom} busy={busy} />
        ) : room ? (
          <section className="lobby-card">
            <div className="lobby-top"><div><p className="eyebrow">{room.phase === "lobby" ? "WAITING ROOM" : "GAME IN PROGRESS"}</p><h2>Your table</h2></div><button className="quiet-button" onClick={leaveRoom} disabled={busy}><ArrowLeft size={15} /> Leave table</button></div>
            <div className="room-code-box"><div><span className="code-caption">ROOM CODE</span><strong>{room.code}</strong></div><button className="copy-button" onClick={copyCode}><Copy size={15} />{copied ? "Copied" : "Copy invite code"}</button></div>
            <div className="players-heading"><span><Users size={16} /> Players</span><span>{room.players.length} / {room.maxPlayers}</span></div>
            <div className="player-list">{Array.from({ length: room.maxPlayers }, (_, index) => {
              const player = room.players.find(candidate => candidate.seat === index)
              return <div className={`player-row ${player ? "occupied" : "empty"}`} key={index}><span className="player-avatar">{player ? player.username.slice(0, 1).toUpperCase() : <Plus size={15} />}</span><span className="player-name">{player?.username ?? "Waiting for player"}{player?.userId === room.hostId && <Crown size={13} className="host-crown" />}</span>{player ? <span className={`player-status ${player.isReady ? "ready" : ""}`}>{player.userId === room.hostId ? "HOST" : player.isReady ? "READY" : "NOT READY"}</span> : <span className="player-status waiting">OPEN SEAT</span>}</div>
            })}</div>
            <div className="lobby-actions">{isHost ? <button className="primary-action" disabled={busy || !canStart || room.phase === "playing"} onClick={startGame}>{room.phase === "playing" ? "Game started" : busy ? "Starting…" : "Start game"}<ArrowRight size={17} /></button> : <button className={`primary-action ${me?.isReady ? "ready-action" : ""}`} disabled={busy || room.phase === "playing"} onClick={() => setReady(!me?.isReady)}>{me?.isReady ? <><Check size={17} /> You’re ready</> : <>I’m ready <ArrowRight size={17} /></>}</button>}</div>
            {room.phase === "lobby" && <p className="lobby-hint">{isHost ? "Share the code and start when everyone is ready." : "Let the host know when you’re ready."}</p>}
          </section>
        ) : (
          <div className="home-actions">
            <section className="action-card create-card"><div className="action-icon red-icon"><Plus size={20} /></div><p className="eyebrow">HOST A GAME</p><h2>Create a table</h2><p className="action-description">Set the table and invite your friends with a room code.</p>
              <label className="control-label">Players at the table<select value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}>{[2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count} players</option>)}</select></label>
              <label className="toggle-control"><span><strong>7–0 rule</strong><small>Swap or rotate hands with 7s and 0s</small></span><input type="checkbox" checked={sevenZero} onChange={event => setSevenZero(event.target.checked)} /><i /></label>
              <button className="primary-action" disabled={busy || !connected} onClick={createRoom}>{busy ? "Setting up table…" : "Create table"}<ArrowRight size={17} /></button>
            </section>
            <section className="action-card join-card"><div className="action-icon yellow-icon"><ArrowDownToLine size={19} /></div><p className="eyebrow">JOIN YOUR CREW</p><h2>Have a code?</h2><p className="action-description">Enter the six-character code from your host.</p>
              <form onSubmit={joinRoom}><label className="control-label">Room code<input className="room-code-input" required minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="e.g. R7K2MX" /></label><button className="secondary-action" type="submit" disabled={busy || !connected || joinCode.length !== 6}>{busy ? "Joining…" : "Join table"}<ArrowRight size={17} /></button></form>
            </section>
          </div>
        )}
      </section>
      <footer className="home-footer"><span><span className="footer-dot" /> NO MERCY, ALL FUN</span><span>ROOMS ARE BETTER WITH FRIENDS</span></footer>
    </main>
  )
}
