import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, Crown, Hand, LogOut, RotateCcw, Shield, Sparkles, Swords, Trophy, Users, X } from "lucide-react"

type Color = "R" | "Y" | "G" | "B"
type Card = { id: string; color: Color | "W"; type: string }
type Player = { userId: string; name: string; seat: number; cardCount: number; lifelines: number; eliminated: boolean; eliminatedBy: string | null }
export type GameView = {
  version: number; status: "playing" | "finished"; players: Player[]; turnPlayerId: string | null; turnSeconds: number
  direction: 1 | -1; activeColor: Color; topCard: Card; drawPileCount: number; discardPileCount: number
  pendingDraw: number; minStackValue: number; prompt: { type: "roulette_color"; playerId: string } | null
  winnerId: string | null; endReason: string | null; standings: { userId: string; name: string; placement: number; cardsLeft: number; eliminated: boolean }[]
  you: { userId: string; seat: number; hand: Card[]; isYourTurn: boolean; playableCardIds: string[]; canDraw: boolean; canTakePenalty: boolean; mustPlayCardId: string | null } | null
}
export type GamePayload = { events: unknown[]; state: GameView; deadlineAt: number | null; serverNow: number; clockOffset?: number }
type Room = { code: string; phase: "lobby" | "playing"; hostId: string; settings: { sevenZero: boolean } }

const COLORS: { id: Color; name: string }[] = [
  { id: "R", name: "Red" }, { id: "Y", name: "Yellow" }, { id: "G", name: "Green" }, { id: "B", name: "Blue" },
]
const COLOR_NAMES: Record<Color, string> = { R: "Red", Y: "Yellow", G: "Green", B: "Blue" }
const TYPE_NAMES: Record<string, string> = { d2: "+2 Draw", d4: "+4 Draw", sk: "Skip", se: "Skip All", rv: "Reverse", da: "Discard All", w4r: "Reverse +4", w6: "+6 Wild", w10: "+10 Wild", cr: "Color Roulette" }
const cardPath = (card: Card) => `/uno/${card.color}_${card.type}.svg`
const cardName = (card: Card) => `${card.color === "W" ? "Wild" : COLOR_NAMES[card.color]} ${TYPE_NAMES[card.type] ?? card.type.slice(1)}`

function describeLatestEvent(payload: GamePayload): string {
  if (!payload.events.length) return "The cards are on the table. Good luck!"
  const event = payload.events[payload.events.length - 1] as { type?: string; playerId?: string; card?: Card; count?: number; amount?: number; total?: number; color?: Color }
  const player = payload.state.players.find(candidate => candidate.userId === event.playerId)?.name ?? "A player"
  const descriptions: Record<string, string> = {
    played: `${player} played ${event.card ? cardName(event.card) : "a card"}.`,
    drew: `${player} drew ${event.count ?? 1} card${event.count === 1 ? "" : "s"}.`,
    penalty_stacked: `The draw penalty stacked to +${event.total ?? event.amount ?? "more"}.`,
    hands_rotated: "Everyone passed their hand around the table!",
    direction_reversed: "Play changed direction.",
    roulette_started: `${player} started Color Roulette!`,
    eliminated: `${player} was eliminated.`,
    game_over: "The round is over!",
    color_chosen: `${player} chose ${COLOR_NAMES[event.color ?? "R"]}.`,
  }
  return descriptions[event.type ?? ""] ?? "The table changed. Your move!"
}

function CardArt({ card, className = "", onClick, disabled = false }: { card: Card; className?: string; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className={`card-art ${className}`} onClick={onClick} disabled={disabled || !onClick} aria-label={`Play ${cardName(card)}`} title={cardName(card)}><img src={cardPath(card)} alt={cardName(card)} draggable={false} /></button>
}

export function GameTable({ room, payload, userId, onAction, onLeave, busy }: {
  room: Room
  payload: GamePayload
  userId: string
  onAction: (event: string, payload?: object) => Promise<unknown | undefined>
  onLeave: () => void
  busy: boolean
}) {
  const game = payload.state
  const [choiceCard, setChoiceCard] = useState<Card | null>(null)
  const [targetId, setTargetId] = useState("")
  const [localError, setLocalError] = useState("")
  const [now, setNow] = useState(0)
  const own = game.you
  const isMyTurn = own?.isYourTurn ?? false
  const secondsLeft = payload.deadlineAt === null || now === 0 ? null : Math.max(0, Math.ceil((payload.deadlineAt - (now + (payload.clockOffset ?? 0))) / 1000))
  const activePlayers = game.players.filter(player => !player.eliminated)
  const opponents = useMemo(() => activePlayers.filter(player => player.userId !== userId), [activePlayers, userId])
  const shouldChooseColor = (card: Card) => ["w4r", "w6", "w10"].includes(card.type)
  const needsTarget = (card: Card) => card.type === "n7" && room.settings.sevenZero

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  const log = describeLatestEvent(payload)

  async function executePlay(card: Card, color?: Color, target?: string) {
    setLocalError("")
    const result = await onAction("game:play", { cardId: card.id, ...(color ? { color } : {}), ...(target ? { targetId: target } : {}) })
    if (result !== undefined) setChoiceCard(null)
  }

  async function clickCard(card: Card) {
    if (!own?.playableCardIds.includes(card.id) || !isMyTurn) return
    if (shouldChooseColor(card) || needsTarget(card)) {
      setTargetId(opponents.find(player => !player.eliminated)?.userId ?? "")
      setChoiceCard(card)
      return
    }
    await executePlay(card)
  }

  async function takeAction(event: string, payload?: object) {
    setLocalError("")
    const result = await onAction(event, payload)
    if (result === undefined) setLocalError("That move could not be sent. Check the connection and try again.")
  }

  const timerPercent = secondsLeft === null || game.turnSeconds === 0 ? 100 : Math.max(0, secondsLeft / game.turnSeconds * 100)
  const turnName = game.players.find(player => player.userId === game.turnPlayerId)?.name ?? "Waiting"

  return (
    <section className="game-layout" aria-label="UNO No Mercy game table">
      <header className="game-topbar">
        <div className="game-brand"><span className="brand-mark">U<span>!</span></span><span><strong>NO MERCY</strong><small>ROOM {room.code}</small></span></div>
        <div className="game-top-status"><span className="live-indicator" />{game.status === "finished" ? "ROUND COMPLETE" : "LIVE GAME"}<span className="top-divider" /><span>MOVE {Math.max(1, game.version)}</span></div>
        <button className="game-leave" onClick={onLeave}><LogOut size={15} /> Leave game</button>
      </header>

      {game.status === "finished" ? (
        <div className="finish-screen">
          <div className="finish-confetti">✦ ✧ ✦</div><div className="finish-trophy"><Trophy size={30} /></div>
          <p className="game-kicker">THAT’S THE ROUND</p><h1>{game.players.find(player => player.userId === game.winnerId)?.name ?? "Game over"} wins!</h1>
          <p className="finish-subtitle">{game.endReason === "last_standing" ? "Last player standing. That was ruthless." : "First one out of cards. Nicely played."}</p>
          <div className="standings-list">{game.standings.map(row => <div className="standing-row" key={row.userId}><b>{String(row.placement).padStart(2, "0")}</b><span>{row.name}{row.userId === game.winnerId && <Crown size={14} />}</span><small>{row.eliminated ? "ELIMINATED" : `${row.cardsLeft} CARDS`}</small></div>)}</div>
          <div className="finish-actions">{room.hostId === userId && <button className="table-primary" onClick={() => void onAction("room:start")}><RotateCcw size={16} /> Play again</button>}<button className="table-secondary" onClick={onLeave}><LogOut size={15} /> Leave table</button></div>
        </div>
      ) : (
        <>
            <div className="game-statusline"><div className={`turn-banner ${isMyTurn ? "my-turn" : ""}`}><span className="turn-icon">{isMyTurn ? <Sparkles size={16} /> : <Clock3 size={16} />}</span><span><strong>{isMyTurn ? "Your turn" : `${turnName} is playing`}</strong><small>{game.prompt?.playerId === userId ? "Choose a color for Color Roulette" : game.pendingDraw > 0 && game.turnPlayerId === userId ? `Stack a draw card or take +${game.pendingDraw}` : own?.canDraw ? "No playable cards? Draw one." : "Keep an eye on the discard pile."}</small></span></div>
            <div className="timer-box"><div className="timer-top"><Clock3 size={14} /><span>{secondsLeft === null ? "NO TIMER" : `${secondsLeft}s`}</span></div><div className="timer-track"><i style={{ width: `${timerPercent}%` }} /></div></div>
          </div>

          <div className="felt-table">
            <div className="felt-grain" />
            <div className="table-ornament">NO MERCY <span>•</span> NO DOUBT</div>
            <div className="opponent-seats">{opponents.map(player => <div className={`opponent-seat ${player.userId === game.turnPlayerId ? "active-seat" : ""} ${player.eliminated ? "out-seat" : ""}`} key={player.userId}>
              <div className="opponent-avatar">{player.name.slice(0, 1).toUpperCase()}{player.userId === room.hostId && <Crown className="seat-crown" size={12} />}</div><div className="opponent-name">{player.name}{player.userId === userId && " (you)"}</div><div className="opponent-meta"><span><Hand size={11} /> {player.cardCount}</span><span><Shield size={11} /> {player.lifelines}</span></div>
              <div className="opponent-card-fan" aria-label={`${player.cardCount} cards`}>{Array.from({ length: Math.min(player.cardCount, 7) }, (_, n) => <img key={n} src="/uno/back.svg" alt="" style={{ left: `${n * 12}px`, transform: `rotate(${(n - 3) * 5}deg)` }} />)}{player.cardCount > 7 && <b>+{player.cardCount - 7}</b>}</div>
              {player.eliminated && <span className="eliminated-label">OUT</span>}
            </div>)}</div>

            <div className="center-play-area">
              <div className="pile-count draw-count">{game.drawPileCount}<small>DRAW PILE</small></div>
              <button className={`draw-pile ${own?.canDraw ? "draw-ready" : ""}`} onClick={() => void takeAction("game:draw")} disabled={!own?.canDraw || busy} aria-label="Draw a card"><img src="/uno/back.svg" alt="Draw pile" /><span><ArrowDown size={16} /> DRAW</span></button>
              <div className="table-arrows"><span className="direction-arrow">{game.direction === 1 ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}</span><span>YOUR TABLE</span><span className="direction-arrow">{game.direction === 1 ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}</span></div>
              <div className="discard-wrap"><div className="active-color-ring" data-color={game.activeColor}><i /></div><CardArt card={game.topCard} className="top-card" /><span className="active-color-label" data-color={game.activeColor}>{COLOR_NAMES[game.activeColor]} ACTIVE</span></div>
              <div className="pile-count discard-count">{game.discardPileCount}<small>DISCARD</small></div>
            </div>

            <div className="table-effects">{game.pendingDraw > 0 && <div className="penalty-badge"><Swords size={14} /> DRAW +{game.pendingDraw} <small>MIN STACK +{game.minStackValue}</small></div>}{game.prompt?.playerId === userId && <div className="roulette-callout">COLOR ROULETTE <small>Choose a color to stop drawing</small><div>{COLORS.map(color => <button key={color.id} className={`roulette-color color-${color.id.toLowerCase()}`} onClick={() => void takeAction("game:chooseColor", { color: color.id })} aria-label={`Choose ${color.name}`} />)}</div></div>}</div>
            <div className="table-log"><span className="log-dot" />{log}</div>
          </div>

          <div className="hand-panel"><div className="hand-heading"><div><span className="hand-title"><Hand size={16} /> YOUR HAND</span><span className="hand-count">{own?.hand.length ?? 0} CARDS</span></div><div className="hand-hint">{isMyTurn ? game.pendingDraw ? "Stack a card or take the penalty" : "Select a glowing card to play" : "Waiting for your turn"}</div></div>
            <div className="player-hand">{own?.hand.map(card => {
              const canPlay = own.playableCardIds.includes(card.id)
              return <CardArt key={card.id} card={card} className={`hand-card ${canPlay && isMyTurn ? "playable" : "unplayable"} ${own.mustPlayCardId === card.id ? "must-play" : ""}`} onClick={() => void clickCard(card)} disabled={!canPlay || !isMyTurn || busy} />
            })}</div>
            {own?.canTakePenalty && <button className="penalty-take" disabled={busy} onClick={() => void takeAction("game:takePenalty")}><ArrowDown size={15} /> Take +{game.pendingDraw} cards <span>and lose your turn</span></button>}
            {localError && <p className="game-error" role="alert">{localError}</p>}
          </div>

          <div className="game-bottomline"><span><Users size={13} /> {activePlayers.length} PLAYERS IN</span><span>7–0 RULE {room.settings.sevenZero ? "ON" : "OFF"}</span><span>TURN {game.turnSeconds ? `${game.turnSeconds} SEC` : "NO LIMIT"}</span></div>
        </>
      )}

      {choiceCard && <div className="choice-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setChoiceCard(null) }}><section className="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choice-title"><button className="choice-close" onClick={() => setChoiceCard(null)} aria-label="Close"><X size={17} /></button><p className="game-kicker">SPECIAL CARD</p><h2 id="choice-title">{needsTarget(choiceCard) ? "Swap hands" : "Choose a color"}</h2><p>{needsTarget(choiceCard) ? "Pick the player who will take your hand." : `Choose the color you want ${cardName(choiceCard)} to become.`}</p>
        {needsTarget(choiceCard) && <div className="target-options">{opponents.filter(player => !player.eliminated).map(player => <button key={player.userId} className={targetId === player.userId ? "selected" : ""} onClick={() => setTargetId(player.userId)}><span className="avatar">{player.name.slice(0, 1).toUpperCase()}</span>{player.name}{targetId === player.userId && <Check size={15} />}</button>)}</div>}
        {shouldChooseColor(choiceCard) && <div className="color-options">{COLORS.map(color => <button key={color.id} className={`color-option color-${color.id.toLowerCase()}`} onClick={() => void executePlay(choiceCard, color.id, needsTarget(choiceCard) ? targetId : undefined)} aria-label={`Choose ${color.name}`}><span />{color.name}</button>)}</div>}
        {!shouldChooseColor(choiceCard) && <button className="table-primary confirm-choice" disabled={!targetId || busy} onClick={() => void executePlay(choiceCard, undefined, targetId)}><Check size={16} /> Confirm swap</button>}
      </section></div>}
    </section>
  )
}
