import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { answerSubmission } from "../../platform/client/session";
import type { GameScreenProps } from "../../platform/contracts";
import type { DiceView } from "./shared";
type DiceSnapshot = {
  phase: DiceView["phase"];
  round: number;
  roster: string[];
  skipped: string[];
  guesses: Record<
    string,
    { locked: boolean; value?: number; revealedValue: number }
  >;
  scores: Record<string, number>;
  result: number;
  revealAt: number;
};
const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
function Die({ value, rolling = false }: { value: number; rolling?: boolean }) {
  return (
    <div
      className={"die " + (rolling ? "tumbling" : "")}
      role="img"
      aria-label={rolling ? "Dice rolling" : "Dice showing " + value}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={pips[value].includes(i) ? "pip on" : "pip"} />
      ))}
    </div>
  );
}
export function DiceScreen({ session, connected, send }: GameScreenProps) {
  const snapshot = session.snapshot;
  const raw = snapshot.game as DiceSnapshot;
  const game: DiceView = {
    ...raw,
    locked: Object.entries(raw.guesses)
      .filter(([, v]) => v.locked)
      .map(([id]) => id),
    ownAnswer: raw.guesses[session.you]?.locked
      ? (raw.guesses[session.you]?.value ?? null)
      : null,
    result: raw.result || null,
    bets:
      raw.phase === "result"
        ? Object.fromEntries(
            Object.entries(raw.guesses)
              .filter(([, v]) => v.locked)
              .map(([id, v]) => [id, v.revealedValue]),
          )
        : null,
  };
  const room = {
    ...session,
    game,
    hostId: snapshot.hostId,
    players: Object.values(snapshot.players).filter((p) => p.role === "player"),
  };
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [face, setFace] = useState(1);
  const [copied, setCopied] = useState(false);
  const host = room.you === room.hostId;
  const display = room.role === "display";
  const participating =
    game.roster.includes(room.you) && !game.skipped.includes(room.you);
  const locked = game.ownAnswer !== null;
  const awaiting = game.roster.filter(
    (id) => !game.skipped.includes(id),
  ).length;
  const winners = room.players.filter((p) => game.bets?.[p.id] === game.result);
  useEffect(() => {
    setSelected(null);
    setError("");
  }, [game.round]);
  useEffect(() => {
    if (game.phase !== "rolling") return;
    const timer = setInterval(() => setFace((v) => (v % 6) + 1), 95);
    return () => clearInterval(timer);
  }, [game.phase]);
  async function act(event: string, payload: object) {
    setBusy(true);
    setError("");
    try {
      await send(event, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/?room=" + room.code,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Share this room code: " + room.code);
    }
  }
  return (
    <main className={"room-page " + (display ? "tv-mode" : "")}>
      <div className="room-title">
        <div>
          <div className="eyebrow">THE GAME IS ON</div>
          <h1>
            Roll the <span className="game-title-word">Dice.</span>
          </h1>
        </div>
        <div className="room-code">
          <span>JOIN AT {location.host}</span>
          <strong>{room.code}</strong>
          <Button className="text-button" onClick={copy}>
            {copied ? "Link copied ✓" : "Copy invite link ↗"}
          </Button>
        </div>
      </div>
      <div className="room-layout">
        <section className="play-panel">
          <div className="round-bar">
            <span>
              {game.round
                ? "ROUND " + String(game.round).padStart(2, "0")
                : "EVERYONE IN?"}
            </span>
            <span>EXACT MATCH = 10 POINTS</span>
          </div>
          <div className="dice-stage">
            <div className="eyebrow">
              {game.phase === "lobby"
                ? "A LITTLE LUCK GOES A LONG WAY"
                : game.phase === "betting"
                  ? "PICK YOUR LUCKY NUMBER"
                  : game.phase === "rolling"
                    ? "HERE WE GO…"
                    : winners.length
                      ? "LUCK FOUND ITS PEOPLE"
                      : "THE DICE HAD OTHER PLANS"}
            </div>
            <Die
              value={
                game.phase === "result"
                  ? game.result!
                  : game.phase === "rolling"
                    ? face
                    : 5
              }
              rolling={game.phase === "rolling"}
            />
            <h2 aria-live="polite">
              {game.phase === "lobby"
                ? "Ready when you are."
                : game.phase === "betting"
                  ? game.locked.length + " of " + awaiting + " locked in"
                  : game.phase === "rolling"
                    ? "Let it roll!"
                    : "It's a " + game.result + "!"}
            </h2>
            <p>
              {game.phase === "lobby"
                ? "Gather your people. The host starts the round."
                : game.phase === "betting"
                  ? "Answers stay secret until the big reveal."
                  : game.phase === "rolling"
                    ? "All guesses are in. Fingers crossed."
                    : winners.length
                      ? winners.map((p) => p.name).join(", ") +
                        " earned 10 points!"
                      : "No matches this time. There's always the next roll."}
            </p>
          </div>
          {game.phase === "betting" && !display && participating && (
            <div className="answer-area">
              <div className="number-picker" aria-label="Choose your number">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Button
                    key={n}
                    className={
                      "number-button " +
                      ((game.ownAnswer ?? selected) === n ? "selected" : "")
                    }
                    aria-pressed={(game.ownAnswer ?? selected) === n}
                    disabled={locked || busy || !connected}
                    onClick={() => setSelected(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <Button
                className={
                  "button full " + (locked ? "locked-button" : "primary")
                }
                disabled={locked || selected === null || busy || !connected}
                onClick={() =>
                  act(
                    "submit",
                    answerSubmission(session, String(game.round), selected),
                  )
                }
              >
                {locked
                  ? "✓ Your " + game.ownAnswer + " is locked in"
                  : busy
                    ? "Locking in…"
                    : "Lock in my number →"}
              </Button>
              <small>
                One guess per round. No take-backs. No actual stakes.
              </small>
            </div>
          )}
          {game.phase === "betting" && !display && !participating && (
            <div className="waiting-note">
              You're on the guest list for the next round. Enjoy this roll!
            </div>
          )}
          {(game.phase === "lobby" || game.phase === "result") && (
            <div className="round-actions">
              {host ? (
                <Button
                  className="button primary"
                  disabled={!connected || busy}
                  onClick={() => act("start", {})}
                >
                  {busy
                    ? "Starting…"
                    : game.phase === "lobby"
                      ? "Start the first round →"
                      : "Roll another round →"}
                </Button>
              ) : (
                <p className="waiting-note">
                  Waiting for{" "}
                  {room.players.find((p) => p.id === room.hostId)?.name ??
                    "the host"}{" "}
                  to start {game.round ? "the next" : "the first"} round.
                </p>
              )}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="score-panel">
          <div className="section-heading">
            <h2>The good company</h2>
            <span>
              {room.players.filter((p) => !p.departed).length} PLAYING
            </span>
          </div>
          <div className="players">
            {[...room.players]
              .sort(
                (a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
              )
              .map((player) => (
                <div
                  className={
                    "player-row " +
                    (game.phase === "result" &&
                    game.bets?.[player.id] === game.result
                      ? "winner"
                      : "")
                  }
                  key={player.id}
                >
                  <span className="player-avatar">
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="player-info">
                    <strong>
                      {player.name}
                      {player.id === room.you ? " (you)" : ""}
                    </strong>
                    <span>
                      {player.departed
                        ? "Left the room"
                        : !player.connected
                          ? "Reconnecting…"
                          : game.phase === "betting" &&
                              game.skipped.includes(player.id)
                            ? "Next round"
                            : game.phase === "betting" &&
                                game.locked.includes(player.id)
                              ? "✓ Locked in"
                              : game.phase === "betting" &&
                                  !game.roster.includes(player.id)
                                ? "Next round"
                                : game.phase === "result" &&
                                    game.bets?.[player.id]
                                  ? "Picked " + game.bets[player.id]
                                  : player.id === room.hostId
                                    ? "Party host"
                                    : "Here for a good time"}
                    </span>
                  </div>
                  <span className="player-score">
                    {game.scores[player.id] ?? 0}
                    <small>PTS</small>
                  </span>
                </div>
              ))}
          </div>
          {!display && (
            <a
              className="tv-link"
              href={"/?room=" + room.code + "&screen=tv"}
              target="_blank"
              rel="noreferrer"
            >
              ▣ &nbsp; Open shared screen ↗
            </a>
          )}
          <div className="room-tip">
            <span>✦</span>
            <p>
              Same number? Same team.
              <br />
              Everyone who guesses right gets points.
            </p>
          </div>
          <p className="disconnect-help">
            Disconnected players get 30 seconds to return before an unanswered
            guess is skipped. New players join the next round.
          </p>
        </aside>
      </div>
    </main>
  );
}
