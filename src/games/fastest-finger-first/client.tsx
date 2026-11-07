import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import { Badge, Button, Input, Modal, Notice } from "../../components/ui";
import { QrCode } from "../../components/qr";
import type { GameScreenProps } from "../../platform/contracts";
import { Choice, MoreOptions, ScoreEditor, useGameAction } from "./controls";
import { useBuzzerSound } from "./buzzer";
import { QuestionMedia } from "./media";
import { Results } from "./results";
import {
  rankedPlayers,
  resultSlides,
  type GameView,
  type PackInfo,
  type Question,
} from "./shared";

type Preview = Question & { played: boolean; mediaUrl?: string };
function readList<T>(value?: string): T[] {
  try {
    const list: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function phaseLabel(game: GameView) {
  if (game.paused) return "Paused by the host";
  switch (game.phase) {
    case "lobby":
      return "Gather your people.";
    case "between":
      return "The host is choosing a question.";
    case "ready":
      return "Wait for the host to open buzzers.";
    case "open":
      return "Buzzers are open!";
    case "answering":
      return "We have a buzz!";
    case "judged":
      return game.verdict === "Correct" ? "That's correct!" : "Not this time.";
    case "revealed":
      return "The answer is…";
    case "ended":
      return "Let's see how you did.";
  }
}
export function FastestScreen({ session, connected, send }: GameScreenProps) {
  const { snapshot, you } = session;
  const game = snapshot.game as GameView;
  const display = session.role === "display",
    host = !display && snapshot.hostId === you;
  const buzzer = useBuzzerSound(
    display && connected && !game.paused && ["ready", "open"].includes(game.phase),
  );
  const previousBuzz = useRef({ scope: game.scope, answering: game.answering });
  useEffect(() => {
    const previous = previousBuzz.current;
    previousBuzz.current = { scope: game.scope, answering: game.answering };
    if (display && connected && !game.paused && game.phase === "answering" && game.answering &&
        previous.scope === game.scope && previous.answering !== game.answering && buzzer.enabled) {
      buzzer.play();
    }
  }, [display, connected, game.scope, game.answering, game.phase, game.paused, buzzer.enabled, buzzer.play]);
  const { act, busy, error, clearError } = useGameAction(send, game.revision);
  const [packChoice, setPackChoice] = useState(""),
    [questionChoice, setQuestionChoice] = useState("");
  const [playHere, setPlayHere] = useState(false);
  const [dialog, setDialog] = useState<"score" | "scoring" | "end" | null>(
    null,
  );
  const [reward, setReward] = useState(String(game.reward)),
    [penalty, setPenalty] = useState(String(game.penalty));
  useEffect(() => {
    setReward(String(game.reward));
    setPenalty(String(game.penalty));
  }, [game.reward, game.penalty, game.questionId]);
  const packs = readList<PackInfo>(host ? game.host?.catalog : undefined);
  const questions = readList<Preview>(host ? game.host?.questions : undefined);
  const selectedPack = packs.some((p) => p.id === packChoice)
    ? packChoice
    : (packs[0]?.id ?? "");
  const unplayed = questions.filter((q) => !q.played);
  const next = unplayed.find((q) => q.id === questionChoice) ?? unplayed[0];
  const players = rankedPlayers(game.stats);
  const participants = Object.values(snapshot.players).filter(
    (p) => p.role === "player" && p.id !== snapshot.hostId && !p.departed,
  );
  const nameOf = (id: string) => snapshot.players[id]?.name ?? "Player";
  const joinUrl =
    location.origin + "/?game=" + snapshot.gameId + "&room=" + session.code;
  const active = !["lobby", "ended"].includes(game.phase);
  const disabled = busy || !connected;
  const raceAvailable = ["ready", "open"].includes(game.phase) && !game.paused;
  const ownLock = game.locks[you];
  const ownTurn = game.answering === you;
  const buzzerDisabled =
    disabled ||
    !raceAvailable ||
    Boolean(ownLock) ||
    !game.roster.includes(you);
  const showHint = !game.paused && ["ready", "open"].includes(game.phase);
  const slides = resultSlides(players.length);

  function packControls() {
    return (
      <div className="fff-form">
        {game.host?.error && <Notice>{game.host.error}</Notice>}
        <Choice
          label="Question pack"
          value={selectedPack}
          onChange={setPackChoice}
          options={packs.map((p) => ({
            value: p.id,
            label: `${p.title} · ${p.count} questions`,
          }))}
          disabled={disabled}
        />
        <div className="fff-actions">
          <Button
            variant="primary"
            disabled={disabled || !selectedPack}
            onClick={() => act("newGame", { pack: selectedPack })}
          >
            {busy
              ? "Loading…"
              : game.phase === "ended"
                ? "Start another game"
                : "Load pack"}
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => act("refreshPacks")}
          >
            Refresh packs
          </Button>
        </div>
        {!packs.length && (
          <p className="fff-caption">
            Add a question pack to the configured packs folder, then refresh.
          </p>
        )}
      </div>
    );
  }
  function hostControls() {
    return (
      <section className="fff-host-controls" aria-label="Host controls">
        <div className="fff-actions fff-actions-between">
          <Badge>PRIVATE HOST SCREEN</Badge>
          <div className="fff-actions">
            {active && (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => act(game.paused ? "resume" : "pause")}
              >
                {game.paused ? <Play size={16} /> : <Pause size={16} />}
                {game.paused ? "Resume" : "Pause"}
              </Button>
            )}
            <MoreOptions
              disabled={disabled}
              canEdit={active}
              onEdit={() => {
                clearError();
                setDialog("score");
              }}
              onEnd={() => setDialog("end")}
            />
          </div>
        </div>
        {game.mediaUrl && (
          <div className="fff-form">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => setPlayHere((value) => !value)}
            >
              {playHere
                ? "Stop clue playback here"
                : "Show / play clue on this device"}
            </Button>
            {playHere && showHint && (
              <QuestionMedia
                key={`${game.questionId}:${game.mediaEpoch}`}
                type={game.questionType}
                url={game.mediaUrl}
                start={game.mediaStart}
                end={game.mediaEnd}
              />
            )}
          </div>
        )}
        {["lobby", "ended"].includes(game.phase) ? (
          packControls()
        ) : (
          <>
            {game.questionId && (
              <div className="fff-private-card">
                <p className="eyebrow">CURRENT QUESTION · READ ALOUD</p>
                <h2>{game.host?.prompt}</h2>
                <div className="fff-answer">
                  <span className="eyebrow">
                    PREPARED ANSWER · ONLY YOU CAN SEE THIS
                  </span>
                  <strong>{game.host?.answer}</strong>
                </div>
              </div>
            )}
            <div className="fff-actions">
              <Button
                variant="primary"
                disabled={disabled || game.paused || game.phase !== "ready"}
                onClick={() => act("openBuzzers")}
              >
                <Play size={17} /> Open buzzers
              </Button>
              <Button
                variant="secondary"
                disabled={
                  disabled ||
                  game.paused ||
                  game.phase !== "judged" ||
                  game.verdict !== "Wrong"
                }
                onClick={() => act("reopen")}
              >
                <RotateCcw size={17} /> Reopen question
              </Button>
              <Button
                variant="secondary"
                disabled={
                  disabled ||
                  game.paused ||
                  !["ready", "open", "judged"].includes(game.phase)
                }
                onClick={() => act("reveal")}
              >
                Reveal answer
              </Button>
            </div>
            {game.answering && (
              <div className="fff-verdict">
                <p>
                  <strong>{nameOf(game.answering)}</strong>
                  {game.phase === "answering"
                    ? " is answering aloud."
                    : ` · ${game.verdict}`}
                </p>
                <div className="fff-actions">
                  <Button
                    className="fff-correct"
                    disabled={
                      disabled || game.paused || game.phase !== "answering"
                    }
                    onClick={() => act("judge", { correct: true })}
                  >
                    <Check size={18} /> Correct · +{game.reward}
                  </Button>
                  <Button
                    className="fff-wrong"
                    disabled={
                      disabled || game.paused || game.phase !== "answering"
                    }
                    onClick={() => act("judge", { correct: false })}
                  >
                    <X size={18} /> Wrong · −{game.penalty}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={
                      disabled || game.paused || game.phase !== "judged"
                    }
                    onClick={() => act("undo")}
                  >
                    Undo last verdict
                  </Button>
                </div>
              </div>
            )}
            {game.questionId && (
              <div className="fff-actions">
                <span>
                  Correct +{game.reward} · Wrong −{game.penalty}
                </span>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={
                    disabled || game.paused || game.phase === "revealed"
                  }
                  onClick={() => {
                    clearError();
                    setDialog("scoring");
                  }}
                >
                  Change question points
                </Button>
              </div>
            )}
            <div className="fff-next-question">
              <Choice
                label="Choose the next question"
                value={next?.id ?? ""}
                onChange={setQuestionChoice}
                options={unplayed.map((q) => ({
                  value: q.id,
                  label: `${questions.indexOf(q) + 1}. ${q.prompt}`,
                }))}
                disabled={disabled || game.paused}
              />
              {next ? (
                <>
                  <p className="fff-caption">
                    {next.type.toUpperCase()} · Answer: {next.answer}
                  </p>
                  <Button
                    variant="primary"
                    disabled={
                      disabled || game.paused || game.phase === "answering"
                    }
                    onClick={() => act("startQuestion", { question: next.id })}
                  >
                    Start question <ArrowRight size={17} />
                  </Button>
                </>
              ) : (
                <p>
                  All questions have been played. Use More options to end the
                  game.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    );
  }
  function publicStage() {
    if (game.phase === "ended") return <Results game={game} nameOf={nameOf} />;
    return (
      <section className="fff-stage" aria-label="Game screen">
        <p className="eyebrow">{game.packTitle || "GET READY TO BUZZ"}</p>
        <h2 aria-live="polite">{phaseLabel(game)}</h2>
        {display && game.answering && !game.paused && (
          <div className="fff-answering">
            <span className="player-avatar">
              {nameOf(game.answering).slice(0, 1).toUpperCase()}
            </span>
            <strong>{nameOf(game.answering)}</strong>
            <span>
              {game.phase === "answering"
                ? "Your answer, please."
                : game.verdict}
            </span>
          </div>
        )}
        {display && showHint && (
          <div className="fff-question-content">
            {game.text && <p className="fff-question-text">{game.text}</p>}
            <QuestionMedia
              key={`${game.questionId}:${game.mediaEpoch}`}
              type={game.questionType}
              url={game.mediaUrl}
              start={game.mediaStart}
              end={game.mediaEnd}
            />
          </div>
        )}
        {display && game.phase === "revealed" && !game.paused && (
          <p className="fff-revealed-answer">{game.answer}</p>
        )}
        {!host && !display && (
          <>
            <Button
              className={`fff-buzzer ${ownTurn && !game.paused ? "fff-buzzer-won" : buzzerDisabled ? "fff-buzzer-off" : ""}`}
              disabled={buzzerDisabled}
              onClick={() => {
                buzzer.play();
                void act("buzz", { scope: game.scope });
              }}
              aria-label={
                ownTurn
                  ? "You won the buzz"
                  : ownLock
                    ? "Locked out: " + ownLock
                    : "Buzz"
              }
            >
              {ownTurn ? (
                <>
                  <Check size={48} />
                  <span>YOU'RE UP</span>
                </>
              ) : (
                <span>BUZZ</span>
              )}
            </Button>
            <p className="fff-buzzer-status" role="status">
              {!connected
                ? "Reconnecting…"
                : game.paused
                  ? "Game paused. Wait for the host."
                  : ownLock
                    ? `${ownLock} · Locked out for this question.`
                    : ownTurn
                      ? "Answer aloud. The host will judge."
                      : snapshot.players[you]?.waiting ||
                          (game.questionId && !game.roster.includes(you))
                        ? "You'll join the next question."
                        : game.phase === "ready"
                          ? "Don't tap yet! An early buzz locks you out."
                          : game.phase === "open"
                            ? "Go! First to buzz gets to answer."
                            : game.answering
                              ? `${nameOf(game.answering)} won the buzz. Wait for the host.`
                              : "Wait for the host."}
            </p>
            <div className="fff-own-score">
              <strong>{game.stats[you]?.score ?? 0}</strong>
              <span>YOUR POINTS</span>
            </div>
          </>
        )}
        {display && ["lobby", "between"].includes(game.phase) && (
          <div className="tv-qr">
            <QrCode value={joinUrl} size={240} />
            <p>
              Scan to join · room <strong>{session.code}</strong>
            </p>
          </div>
        )}
      </section>
    );
  }
  return (
    <main
      className={`room-page fff-page ${display ? "fff-display" : !host ? "fff-player" : ""}`}
    >
      {display && !buzzer.enabled && (
        <Button onClick={buzzer.enable}>Enable buzzer sound on TV</Button>
      )}
      <div className="room-title">
        <div>
          <p className="eyebrow">
            {host ? "YOU RUN THE SHOW" : "FAST THINKING. FAST FINGERS."}
          </p>
          <h1>
            Fastest <span className="game-title-word">Finger First.</span>
          </h1>
        </div>
        <div className="room-code">
          <span>JOIN AT {location.host}</span>
          <strong>{session.code}</strong>
        </div>
      </div>
      <div className="room-layout">
        <section className="play-panel">
          <div className="round-bar">
            <span>
              {game.questionNumber
                ? `QUESTION ${game.questionNumber} / ${game.totalQuestions}`
                : "EVERYONE IN?"}
            </span>
            <span>
              {active
                ? `CORRECT +${game.reward} · WRONG −${game.penalty}`
                : "FIRST TO BUZZ GETS THE FLOOR"}
            </span>
          </div>
          {host && game.phase !== "ended" && hostControls()}
          {(!host || game.phase === "ended") && publicStage()}
          {host && active && (
            <p className="fff-host-status" role="status">
              {phaseLabel(game)}
            </p>
          )}
          {host && game.phase === "ended" && (
            <nav className="fff-slide-controls" aria-label="Results slides">
              <Button
                variant="secondary"
                disabled={disabled || game.slide === 0}
                onClick={() => act("slide", { index: game.slide - 1 })}
              >
                <ArrowLeft size={18} /> Previous
              </Button>
              <span>
                {game.slide + 1} / {slides.length}
              </span>
              <Button
                variant="primary"
                disabled={disabled || game.slide >= slides.length - 1}
                onClick={() => act("slide", { index: game.slide + 1 })}
              >
                Next <ArrowRight size={18} />
              </Button>
            </nav>
          )}
          {host && game.phase === "ended" && (
            <details className="fff-replay">
              <summary>Play again</summary>
              {packControls()}
            </details>
          )}
          {error && <Notice onDismiss={clearError}>{error}</Notice>}
        </section>
        <aside className="score-panel">
          <div className="section-heading">
            <h2>
              {game.phase === "ended" ? "The final scores" : "The good company"}
            </h2>
            <span>{participants.length} PLAYERS</span>
          </div>
          <div className="players">
            {(players.length
              ? players.map((p) => p.id)
              : participants.map((p) => p.id)
            ).map((id) => {
              const person = snapshot.players[id],
                stats = game.stats[id];
              return (
                <div
                  className={`player-row ${game.answering === id ? "winner" : ""}`}
                  key={id}
                >
                  <span className="player-avatar">
                    {nameOf(id).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="player-info">
                    <strong>
                      {nameOf(id)}
                      {id === you ? " (you)" : ""}
                    </strong>
                    <span>
                      {person?.departed
                        ? "Left the room"
                        : !person?.connected
                          ? "Disconnected"
                          : person.waiting
                            ? "Next question"
                            : game.locks[id]
                              ? game.locks[id]
                              : game.answering === id
                                ? "Won the buzz"
                                : "Ready to play"}
                    </span>
                  </div>
                  <span className="player-score">
                    {stats?.score ?? 0}
                    <small>PTS</small>
                  </span>
                </div>
              );
            })}
          </div>
          {!display && (
            <a
              className="tv-link"
              href={joinUrl + "&screen=tv"}
              target="_blank"
              rel="noreferrer"
            >
              ▣ Open shared screen ↗
            </a>
          )}
          <div className="room-tip">
            <Trophy size={20} />
            <p>
              Wait for open buzzers.
              <br />
              An early tap means sitting this question out.
            </p>
          </div>
        </aside>
      </div>
      {host && (
        <>
          <ScoreEditor
            key={dialog === "score" ? "editing" : "closed"}
            open={dialog === "score"}
            onClose={() => setDialog(null)}
            players={players.map((p) => ({
              id: p.id,
              name: nameOf(p.id),
              score: p.score,
            }))}
            busy={disabled}
            error={error}
            onSave={(player, total) => act("editScore", { player, total })}
          />
          <Modal
            open={dialog === "scoring"}
            onClose={() => setDialog(null)}
            title="Question points"
            description="Applies to all judged answers on the current question, including earlier attempts."
          >
            <form
              className="fff-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await act("scoring", {
                    reward: Number(reward),
                    penalty: Number(penalty),
                  })
                )
                  setDialog(null);
              }}
            >
              <label>
                Correct answer reward
                <Input
                  type="number"
                  required
                  min={0}
                  max={10000}
                  step={1}
                  value={reward}
                  onValueChange={setReward}
                />
              </label>
              <label>
                Wrong answer deduction
                <Input
                  type="number"
                  required
                  min={0}
                  max={10000}
                  step={1}
                  value={penalty}
                  onValueChange={setPenalty}
                />
              </label>
              <Button type="submit" variant="primary" disabled={disabled}>
                Save question points
              </Button>
              {error && <Notice>{error}</Notice>}
            </form>
          </Modal>
          <Modal
            open={dialog === "end"}
            onClose={() => setDialog(null)}
            title="End this game?"
            description="Finish play and show the results slideshow. You can start another game in this room afterward."
          >
            <div className="fff-actions">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Keep playing
              </Button>
              <Button
                variant="primary"
                disabled={disabled}
                onClick={async () => {
                  if (await act("endGame")) setDialog(null);
                }}
              >
                End game and show results
              </Button>
            </div>
            {error && <Notice>{error}</Notice>}
          </Modal>
        </>
      )}
    </main>
  );
}
