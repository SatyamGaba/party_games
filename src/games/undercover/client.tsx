import { useEffect, useState, type ReactNode } from "react";
import { Button, Input } from "../../components/ui";
import { QrCode } from "../../components/qr";
import type { GameScreenProps, Participant } from "../../platform/contracts";
import {
  CATEGORIES,
  DISCUSSION_SECONDS,
  LIMITS,
  TURN_SECONDS,
  allSplits,
  suggestedSplit,
  validSplit,
  type Role,
} from "./rules";

type Snapshot = {
  phase: "lobby" | "cards" | "describe" | "discuss" | "vote" | "verdict" | "guess" | "ended";
  game: number;
  round: number;
  settings: {
    clueMode: "spoken" | "typed";
    turnSeconds: number;
    discussionSeconds: number;
    moderatorView: "reveal" | "hide";
    splitMode: "suggested" | "custom" | "random";
    undercover: number;
    white: number;
    categories: string[];
  };
  roster: string[];
  out: string[];
  revealed: Record<string, Role>;
  cards: Record<string, { word?: string; white?: boolean }>;
  roles: Record<string, { role?: Role }>;
  ready: string[];
  order: string[];
  turn: number;
  deadline: number;
  clues: { round: number; by: string; text: string; skipped: boolean }[];
  ballots: Record<string, { cast: boolean; target?: string }>;
  candidates: string[];
  tieBreak: boolean;
  tally: Record<string, number>;
  lastVotes: Record<string, string>;
  outcome: "" | "tie" | "nobody" | "ousted";
  lastOusted: string;
  guessBy: string;
  guessText: string;
  guessCorrect: boolean;
  winningSide: "" | "civilians" | "infiltrators" | "white";
  winners: string[];
  final: Record<string, { role: Role; word: string }>;
  civilianWord: string;
  undercoverWord: string;
  scores: Record<string, number>;
};

const ROLE_NAME: Record<Role, string> = {
  civilian: "Civilian",
  undercover: "Undercover",
  white: "Mr. White",
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Choice<T extends string | number>({
  value,
  options,
  label,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange(v: T): void;
  disabled?: boolean;
}) {
  return (
    <div className="uc-field">
      <span className="uc-label">{label}</span>
      <div className="uc-segments" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={"uc-segment " + (o.value === value ? "on" : "")}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const seconds = (n: number) => (n ? n + "s" : "No limit");

export function UndercoverScreen({ session, connected, send }: GameScreenProps) {
  const snapshot = session.snapshot;
  const game = snapshot.game as Snapshot;
  const you = session.you;
  const display = session.role === "display";
  const host = !display && you === snapshot.hostId;
  const players = Object.values(snapshot.players).filter(
    (p) => p.role === "player",
  ) as Participant[];
  const nameOf = (id: string) =>
    snapshot.players[id]?.name ?? "Someone";
  const inRoster = game.roster.includes(you);
  const alive = game.roster.filter((id) => !game.out.includes(id));
  const playing = alive.includes(you);
  const card = game.cards[you];
  const speaker = game.phase === "describe" ? game.order[game.turn] : "";
  const now = useNow(game.deadline > 0);
  const left = game.deadline ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : 0;
  const joinUrl = location.origin + "/?game=" + snapshot.gameId + "&room=" + session.code;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [showWord, setShowWord] = useState(false);

  useEffect(() => {
    setText("");
    setError("");
  }, [game.phase, game.turn, game.round, game.game]);

  async function act(type: string, payload: object = {}) {
    setBusy(true);
    setError("");
    try {
      await send(type, payload);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const s = game.settings;
  const lobbyPlayers = players.filter(
    (p) => p.id !== snapshot.hostId && p.connected && !p.departed && !p.waiting,
  );
  const n = lobbyPlayers.length;
  const effectiveSplit =
    s.splitMode === "custom" ? { undercover: s.undercover, white: s.white } : suggestedSplit(n);

  function header(eyebrow: string, title: ReactNode, note?: ReactNode) {
    return (
      <div className="dice-stage uc-stage">
        <div className="eyebrow">{eyebrow}</div>
        <h2 aria-live="polite">{title}</h2>
        {note && <p>{note}</p>}
      </div>
    );
  }

  function stage() {
    switch (game.phase) {
      case "lobby":
      case "ended":
        return null;
      case "cards":
        return header(
          "GAME " + game.game,
          "Check your word.",
          game.ready.filter((id) => alive.includes(id)).length +
            " of " +
            alive.length +
            " ready" +
            (left ? " · starting in " + left + "s" : ""),
        );
      case "describe":
        return header(
          "ROUND " + game.round + " · DESCRIPTION",
          speaker === you ? "Your turn!" : nameOf(speaker) + "'s turn",
          (s.clueMode === "spoken" ? "Say one word or phrase out loud." : "Type one word or phrase.") +
            (left ? " " + left + "s left." : ""),
        );
      case "discuss":
        return header(
          "ROUND " + game.round + " · DISCUSSION",
          "Who's hiding something?",
          left ? left + "s until the vote." : "The host opens the vote when you're ready.",
        );
      case "vote":
        return header(
          game.tieBreak ? "TIE-BREAK VOTE" : "ROUND " + game.round + " · VOTE",
          Object.values(game.ballots).filter((b) => b.cast).length +
            " of " +
            alive.length +
            " voted",
          game.tieBreak
            ? "It's a tie between " + game.candidates.map(nameOf).join(" and ") + ". Vote again."
            : "Votes are secret until everyone has voted.",
        );
      case "verdict":
      case "guess":
        return header(
          "THE VERDICT",
          game.outcome === "ousted"
            ? nameOf(game.lastOusted) + " was " + (game.revealed[game.lastOusted] === "civilian" ? "a " : "") + ROLE_NAME[game.revealed[game.lastOusted]] + (game.revealed[game.lastOusted] === "undercover" ? " agent" : "") + "!"
            : "Still tied. Nobody is out.",
          game.phase === "guess"
            ? nameOf(game.guessBy) + " gets one guess at the Civilians' word…"
            : game.guessBy && game.guessText
              ? `Mr. White guessed “${game.guessText}”. Wrong!`
              : "Next round starting…",
        );
    }
  }

  function wordCard() {
    if (!inRoster || display || game.phase === "lobby" || game.phase === "ended") return null;
    const word = card?.white ? null : card?.word;
    return (
      <div className="uc-card">
        <span className="uc-label">YOUR WORD</span>
        <button
          type="button"
          className="uc-word"
          onClick={() => setShowWord((v) => !v)}
          aria-pressed={showWord || game.phase === "cards"}
        >
          {showWord || game.phase === "cards"
            ? word ?? "You are Mr. White"
            : "Tap to peek"}
        </button>
        <small>
          {card?.white
            ? "You have no word. Listen closely and bluff."
            : "You don't know if you're a Civilian or the Undercover."}
          {!playing && " You've been ousted."}
        </small>
      </div>
    );
  }

  function action() {
    if (display) return null;
    if (game.phase === "cards" && playing)
      return game.ready.includes(you) ? (
        <p className="waiting-note">Waiting for the others…</p>
      ) : (
        <Button className="button primary full" disabled={busy || !connected} onClick={() => act("ready")}>
          I've got it →
        </Button>
      );
    if (game.phase === "describe" && speaker === you)
      return s.clueMode === "typed" ? (
        <form
          className="uc-row"
          onSubmit={(e) => {
            e.preventDefault();
            void act("clue", { text });
          }}
        >
          <Input
            value={text}
            maxLength={LIMITS.clue}
            placeholder="Your clue"
            aria-label="Your clue"
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <Button className="button primary" type="submit" disabled={busy || !text.trim() || !connected}>
            Send
          </Button>
        </form>
      ) : (
        <Button className="button primary full" disabled={busy || !connected} onClick={() => act("done")}>
          I've said my clue ✓
        </Button>
      );
    if (game.phase === "vote" && playing) {
      const mine = game.ballots[you]?.target;
      const options = (game.candidates.length ? game.candidates : alive).filter((id) => id !== you);
      return (
        <div className="uc-vote" role="radiogroup" aria-label="Vote to oust">
          {options.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mine === id}
              className={"uc-segment " + (mine === id ? "on" : "")}
              disabled={busy || !connected}
              onClick={() => act("vote", { target: id })}
            >
              {nameOf(id)}
            </button>
          ))}
          <small>You can change your vote until it closes.</small>
        </div>
      );
    }
    if (game.phase === "guess" && game.guessBy === you)
      return (
        <form
          className="uc-row"
          onSubmit={(e) => {
            e.preventDefault();
            void act("guess", { text });
          }}
        >
          <Input
            value={text}
            maxLength={LIMITS.guess}
            placeholder="The Civilians' word is…"
            aria-label="Your guess"
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <Button className="button primary" type="submit" disabled={busy || !text.trim() || !connected}>
            Guess
          </Button>
        </form>
      );
    return null;
  }

  function hostControls() {
    if (!host) return null;
    const controls: ReactNode[] = [];
    if (game.phase === "describe")
      controls.push(
        <Button key="skip" className="button" disabled={busy} onClick={() => act("skipTurn")}>
          Skip {nameOf(speaker)}
        </Button>,
      );
    if (game.phase === "discuss")
      controls.push(
        <Button key="open" className="button primary" disabled={busy} onClick={() => act("openVote")}>
          Start the vote →
        </Button>,
      );
    if (game.phase === "vote")
      controls.push(
        <Button key="close" className="button" disabled={busy} onClick={() => act("closeVote")}>
          Close the vote now
        </Button>,
      );
    return controls.length ? <div className="round-actions uc-row">{controls}</div> : null;
  }

  function settingsPanel() {
    const splits = allSplits(Math.max(n, 3));
    const maxUndercover = Math.max(1, ...splits.map((x) => x.undercover));
    const set = (patch: object) => act("settings", patch);
    const disabled = !host || busy || !connected;
    return (
      <div className="answer-area uc-settings">
        <Choice
          label="Clues"
          value={s.clueMode}
          disabled={disabled}
          options={[
            { value: "spoken", label: "Spoken" },
            { value: "typed", label: "Typed" },
          ]}
          onChange={(v) => set({ clueMode: v })}
        />
        <Choice
          label="Turn timer"
          value={s.turnSeconds}
          disabled={disabled}
          options={TURN_SECONDS.map((v) => ({ value: v, label: seconds(v) }))}
          onChange={(v) => set({ turnSeconds: v })}
        />
        <Choice
          label="Discussion timer"
          value={s.discussionSeconds}
          disabled={disabled}
          options={DISCUSSION_SECONDS.map((v) => ({ value: v, label: seconds(v) }))}
          onChange={(v) => set({ discussionSeconds: v })}
        />
        <Choice
          label="Roles"
          value={s.splitMode}
          disabled={disabled}
          options={[
            { value: "suggested", label: "Suggested" },
            { value: "custom", label: "Custom" },
            { value: "random", label: "Random" },
          ]}
          onChange={(v) =>
            set(
              v === "custom"
                ? { splitMode: v, ...suggestedSplit(Math.max(n, 3)) }
                : { splitMode: v },
            )
          }
        />
        {s.splitMode === "custom" && (
          <>
            <Choice
              label="Undercover"
              value={s.undercover}
              disabled={disabled}
              options={Array.from({ length: maxUndercover + 1 }, (_, i) => ({
                value: i,
                label: String(i),
              }))}
              onChange={(v) => set({ undercover: v })}
            />
            <Choice
              label="Mr. White"
              value={s.white}
              disabled={disabled}
              options={[
                { value: 0, label: "None" },
                { value: 1, label: "One" },
              ]}
              onChange={(v) => set({ white: v })}
            />
          </>
        )}
        <p className="uc-hint">
          {s.splitMode === "random"
            ? "A random valid mix of Undercover and Mr. White."
            : `${effectiveSplit.undercover} Undercover · ${effectiveSplit.white} Mr. White · ${Math.max(0, n - effectiveSplit.undercover - effectiveSplit.white)} Civilians`}
          {n >= 3 && s.splitMode === "custom" && !validSplit(n, effectiveSplit) &&
            " · Civilians must outnumber Infiltrators."}
        </p>
        <Choice
          label="Host sees"
          value={s.moderatorView}
          disabled={disabled}
          options={[
            { value: "reveal", label: "All roles" },
            { value: "hide", label: "Hide roles" },
          ]}
          onChange={(v) => set({ moderatorView: v })}
        />
        {(
          <div className="uc-field">
            <span className="uc-label">Categories {s.categories.length ? "" : "(all)"}</span>
            <div className="uc-segments wrap">
              {CATEGORIES.map((c) => {
                const on = s.categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    className={"uc-segment " + (on ? "on" : "")}
                    disabled={disabled}
                    onClick={() =>
                      set({
                        categories: on
                          ? s.categories.filter((x) => x !== c)
                          : [...s.categories, c],
                      })
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function endPanel() {
    const side =
      game.winningSide === "civilians"
        ? "The Civilians win!"
        : game.winningSide === "white"
          ? "Mr. White guessed it!"
          : "The Infiltrators win!";
    return (
      <div className="dice-stage uc-stage">
        <div className="eyebrow">GAME {game.game} · OVER</div>
        <h2>{side}</h2>
        <p>
          Civilians had <strong>{game.civilianWord}</strong>, the Undercover had{" "}
          <strong>{game.undercoverWord}</strong>.
          {game.winningSide === "white" && ` ${nameOf(game.guessBy)} guessed “${game.guessText}”.`}
        </p>
        <ul className="uc-final">
          {game.roster.map((id) => (
            <li key={id} className={game.winners.includes(id) ? "won" : ""}>
              <strong>{nameOf(id)}</strong>
              <span>
                {ROLE_NAME[game.final[id]?.role]}
                {game.final[id]?.word ? " · " + game.final[id].word : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const lastVotes = Object.entries(game.lastVotes);
  const log = game.clues.filter((c) => c.round === game.round);

  function status(p: Participant) {
    const id = p.id;
    if (p.departed) return "Left the room";
    if (!p.connected) return "Disconnected";
    if (p.waiting) return "Next game";
    if (id === snapshot.hostId) return "Host";
    if (game.phase === "lobby") return "Ready to play";
    if (!game.roster.includes(id)) return "Next game";
    const revealed = game.revealed[id] ?? (game.phase === "ended" ? game.final[id]?.role : undefined);
    if (game.out.includes(id))
      return "Out" + (revealed ? " · " + ROLE_NAME[revealed] : "");
    if (game.phase === "ended") return ROLE_NAME[game.final[id]?.role];
    const secret = game.roles[id]?.role;
    const parts: string[] = [];
    if (secret) parts.push(ROLE_NAME[secret] + (game.cards[id]?.word ? " · " + game.cards[id].word : ""));
    if (game.phase === "cards") parts.push(game.ready.includes(id) ? "✓ Ready" : "Reading…");
    if (game.phase === "describe" && id === speaker) parts.push("Speaking");
    if (game.phase === "vote") {
      const b = game.ballots[id];
      parts.push(b?.cast ? "✓ Voted" + (b.target ? " " + nameOf(b.target) : "") : "Voting…");
    }
    return parts.join(" · ") || "Still in";
  }

  const betweenGames = game.phase === "lobby" || game.phase === "ended";
  return (
    <main className="room-page">
      {!display && (
        <div className="room-title">
          <div>
            <div className="eyebrow">TRUST NO ONE</div>
            <h1>
              Under<span className="game-title-word">cover.</span>
            </h1>
          </div>
          <div className="room-code">
            <span>JOIN AT {location.host}</span>
            <strong>{session.code}</strong>
          </div>
        </div>
      )}
      <div className="room-layout">
        <section className="play-panel">
          <div className="round-bar">
            <span>{game.game ? "GAME " + String(game.game).padStart(2, "0") : "GATHER ROUND"}</span>
            <span>
              {betweenGames
                ? n + " PLAYERS · NEED 3–20"
                : alive.length + " STILL IN · " + game.out.length + " OUT"}
            </span>
          </div>
          {game.phase === "ended" && endPanel()}
          {game.phase === "lobby" &&
            header(
              "SOCIAL DEDUCTION",
              host ? "Set up the game." : "Waiting for the host.",
              "Everyone gets the same secret word… almost. Give clues, find the impostors, vote them out.",
            )}
          {stage()}
          {wordCard()}
          {action() && <div className="answer-area">{action()}</div>}
          {hostControls()}
          {(game.phase === "verdict" || game.phase === "guess" || (game.phase === "vote" && game.outcome === "tie")) &&
            lastVotes.length > 0 && (
              <div className="answer-area">
                <span className="uc-label">LAST VOTE</span>
                <ul className="uc-log">
                  {lastVotes.map(([voter, target]) => (
                    <li key={voter}>
                      {nameOf(voter)} → <strong>{nameOf(target)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {s.clueMode === "typed" && log.length > 0 && !betweenGames && (
            <div className="answer-area">
              <span className="uc-label">CLUES · ROUND {game.round}</span>
              <ul className="uc-log">
                {log.map((c, i) => (
                  <li key={i}>
                    {nameOf(c.by)}: <strong>{c.skipped ? "— (no clue)" : c.text}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {display && betweenGames && (
            <div className="tv-qr">
              <QrCode value={joinUrl} size={240} />
              <p>
                Scan to join · or go to {location.host} and enter <strong>{session.code}</strong>
              </p>
            </div>
          )}
          {betweenGames && settingsPanel()}
          {betweenGames && (
            <div className="round-actions">
              {host ? (
                <Button
                  className="button primary"
                  disabled={!connected || busy || n < 3}
                  onClick={() => act("start")}
                >
                  {n < 3
                    ? `Need ${3 - n} more player${3 - n === 1 ? "" : "s"}`
                    : game.game
                      ? "Deal a new game →"
                      : "Deal the words →"}
                </Button>
              ) : (
                <p className="waiting-note">
                  {nameOf(snapshot.hostId)} is hosting. They'll deal the words when everyone's in.
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
            <h2>Suspects</h2>
            <span>{players.filter((p) => !p.departed).length} IN THE ROOM</span>
          </div>
          <div className="players">
            {[...players]
              .filter((p) => !p.departed || game.roster.includes(p.id))
              .sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0))
              .map((p) => (
                <div
                  key={p.id}
                  className={
                    "player-row " +
                    (game.phase === "ended" && game.winners.includes(p.id) ? "winner " : "") +
                    (game.out.includes(p.id) && !betweenGames ? "uc-out" : "")
                  }
                >
                  <span className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</span>
                  <div className="player-info">
                    <strong>
                      {p.name}
                      {p.id === you ? " (you)" : ""}
                    </strong>
                    <span>{status(p)}</span>
                  </div>
                  <span className="player-score">
                    {game.scores[p.id] ?? 0}
                    <small>PTS</small>
                  </span>
                </div>
              ))}
          </div>
          {!display && (
            <a className="tv-link" href={joinUrl + "&screen=tv"} target="_blank" rel="noreferrer">
              ▣ &nbsp; Open shared screen ↗
            </a>
          )}
          <div className="room-tip">
            <span>✦</span>
            <p>
              Civilians win 2 · Mr. White 6 · Undercover 10.
              <br />
              Ousted Mr. White gets one guess at the word.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
