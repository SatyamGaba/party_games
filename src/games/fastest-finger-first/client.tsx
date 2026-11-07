import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  X,
} from "lucide-react";
import { Button, Card, Input, Modal, Notice } from "../../components/ui";
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
    display && connected && !game.paused && game.questionType === "text" && game.phase === "open",
  );
  const showingScoreIntro = display && game.phase === "ready" && !game.paused;
  const previousBuzz = useRef({ scope: game.scope, answering: game.answering });
  useEffect(() => {
    const previous = previousBuzz.current;
    previousBuzz.current = { scope: game.scope, answering: game.answering };
    if (display && connected && !game.paused && game.phase === "answering" && game.answering &&
        previous.scope === game.scope && previous.answering !== game.answering && buzzer.enabled) {
      buzzer.play();
    }
  }, [display, connected, game.scope, game.answering, game.phase, game.paused, buzzer.enabled, buzzer.play]);
  const previousPhase = useRef(game.phase);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = game.phase;
    if (display && connected && !game.paused && buzzer.enabled &&
        previous === "answering" && game.phase === "judged") {
      buzzer.playVerdict(game.verdict === "Correct");
    }
  }, [display, connected, game.phase, game.paused, game.verdict, buzzer.enabled, buzzer.playVerdict]);
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
  useEffect(() => { if (game.phase === "answering") setQuestionChoice(game.questionId); }, [game.phase, game.questionId]);
  const selectedQuestion = questions.find((q) => q.id === questionChoice) ??
    questions.find((q) => q.id === game.questionId) ?? questions[0];
  const selectedIndex = questions.findIndex((q) => q.id === selectedQuestion?.id);
  useEffect(() => { setQuestionChoice(game.questionId); }, [game.game, game.questionId]);
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
  const showHint = !game.paused && game.phase === "open";
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
            {selectedQuestion && (
              <div className={`fff-private-card ${selectedQuestion.played && (selectedQuestion.id !== game.questionId || game.phase === "revealed") ? "fff-question-played" : ""}`}>
                <p className="eyebrow">QUESTION {selectedIndex + 1} OF {questions.length} · {selectedQuestion.played && (selectedQuestion.id !== game.questionId || game.phase === "revealed") ? "ALREADY PLAYED" : selectedQuestion.id === game.questionId ? "CURRENT QUESTION" : "READY TO CAST"}</p>
                <h2>{selectedQuestion.prompt}</h2>
                <div className="fff-answer">
                  <span className="eyebrow">
                    PREPARED ANSWER · ONLY YOU CAN SEE THIS
                  </span>
                  <strong>{selectedQuestion.answer}</strong>
                </div>
                {!selectedQuestion.played && (
                  <Button variant="primary" disabled={disabled || game.paused || game.phase === "answering"} onClick={() => act("startQuestion", { question: selectedQuestion.id })}>
                    Cast question <ArrowRight size={17} />
                  </Button>
                )}
                {selectedQuestion.id === game.questionId && (
                  <>
                    {game.phase === "judged" && <p><strong>{nameOf(game.answering)}</strong> · {game.verdict}</p>}
                    {["ready", "open", "judged"].includes(game.phase) && (
                      <div className="fff-actions">
                        {game.phase === "judged" && game.verdict === "Wrong" && <Button variant="primary" disabled={disabled || game.paused} onClick={() => act("reopen")}><RotateCcw size={17} /> Reopen question</Button>}
                        <Button variant={game.phase === "judged" && game.verdict === "Correct" ? "primary" : "secondary"} disabled={disabled || game.paused} onClick={() => act("reveal")}>Reveal answer</Button>
                        {game.phase === "judged" && <Button variant="ghost" disabled={disabled || game.paused} onClick={() => act("undo")}>Undo last verdict</Button>}
                      </div>
                    )}
                    {game.phase === "revealed" && <p>Answer revealed.</p>}
                  </>
                )}
              </div>
            )}
            {selectedQuestion?.id === game.questionId && (
              <>
                    {game.phase === "answering" && (
                      <div className="fff-verdict">
                        <p><strong>{nameOf(game.answering)}</strong> is answering aloud.</p>
                        <div className="fff-actions">
                          <Button className="fff-correct" disabled={disabled || game.paused} onClick={() => act("judge", { correct: true })}><Check size={18} /> Correct · +{game.reward}</Button>
                          <Button className="fff-wrong" disabled={disabled || game.paused} onClick={() => act("judge", { correct: false })}><X size={18} /> Wrong · −{game.penalty}</Button>
                        </div>
                      </div>
                    )}
              </>
            )}
            <div className="fff-next-question fff-actions">
              <Button variant="secondary" disabled={disabled || game.phase === "answering" || selectedIndex <= 0} onClick={() => setQuestionChoice(questions[selectedIndex - 1].id)}>
                <ArrowLeft size={17} /> Previous question
              </Button>
              <Button variant="secondary" disabled={disabled || game.phase === "answering" || selectedIndex < 0 || selectedIndex >= questions.length - 1} onClick={() => setQuestionChoice(questions[selectedIndex + 1].id)}>
                Next question <ArrowRight size={17} />
              </Button>
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
        {display && !game.paused && game.phase === "judged" && (
          <div className={`fff-verdict-effects ${game.verdict === "Correct" ? "fff-confetti" : "fff-crying"}`} aria-hidden="true" key={`${game.scope}:${game.verdict}`}>
            {Array.from({ length: game.verdict === "Correct" ? 24 : 8 }, (_, index) => (
              <span key={index} style={{ left: `${5 + ((index * 37) % 90)}%`, animationDelay: `${(index % 6) * 0.12}s` }}>
                {game.verdict === "Correct" ? "" : "😢"}
              </span>
            ))}
          </div>
        )}
        {display && (
          <>
            {game.phase !== "open" && <h2 aria-live="polite">{phaseLabel(game)}</h2>}
          </>
        )}
        {display && game.answering && !game.paused && (
          <div className="fff-answering">
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
  if (host && game.phase === "lobby") {
    const joined = participants.filter((person) => person.connected);
    return (
      <main className="fff-lobby" aria-label="Game lobby">
        <Card className="fff-lobby-card">
          <p className="eyebrow">ROOM CODE</p>
          <strong className="fff-lobby-code">{session.code}</strong>
          <div className="fff-lobby-heading"><h1>Players joined</h1><span>{joined.length} joined</span></div>
          <div className="fff-lobby-players" aria-live="polite">
            {joined.length ? joined.map((person) => (
              <div className="fff-lobby-player" key={person.id}>
                <span className="player-avatar">{person.name.slice(0, 1).toUpperCase()}</span>
                <strong>{person.name}</strong>
              </div>
            )) : <p className="fff-caption">Waiting for players to join…</p>}
          </div>
          {game.host?.error && <Notice>{game.host.error}</Notice>}
          <Choice label="Question pack" value={selectedPack} onChange={setPackChoice}
            options={packs.map((p) => ({ value: p.id, label: `${p.title} · ${p.count} questions` }))} disabled={disabled} />
          {!packs.length && <p className="fff-caption">Add a question pack, then refresh.</p>}
          <Button variant="ghost" disabled={disabled} onClick={() => act("refreshPacks")}>Refresh packs</Button>
          <Button variant="primary" disabled={disabled || !selectedPack || joined.length === 0} onClick={() => act("newGame", { pack: selectedPack })}>
            {busy ? "Starting…" : "Start the game"} <ArrowRight size={18} />
          </Button>
        </Card>
      </main>
    );
  }
  return (
    <main
      className={`room-page fff-page ${display ? "fff-display" : !host ? "fff-player" : ""}`}
    >
      {display && !buzzer.enabled && (
        <Button onClick={buzzer.enable}>Enable TV sound</Button>
      )}
      {host && (
        <div className="room-title">
          <p className="eyebrow">YOU RUN THE SHOW</p>
        </div>
      )}
      <div className={`room-layout ${display && !active ? "fff-tv-full" : display ? "fff-tv-sidebar-layout" : ""}`}>
        <section className={`play-panel ${display && !game.paused && game.phase === "open" ? "fff-tv-buzz-open" : display && !game.paused && game.phase === "answering" ? "fff-tv-buzz-won" : display && !game.paused && game.phase === "judged" ? (game.verdict === "Correct" ? "fff-tv-correct" : "fff-tv-wrong") : ""}`}>
          <div className="round-bar">
            <span>
              {game.questionNumber
                ? `QUESTION ${game.questionNumber} / ${game.totalQuestions}`
                : "EVERYONE IN?"}
            </span>
            {host ? (
              <MoreOptions disabled={disabled} canEdit={active} paused={game.paused} onPause={() => act(game.paused ? "resume" : "pause")} canChangePoints={Boolean(game.questionId) && !game.paused && game.phase !== "revealed"} onChangePoints={() => { clearError(); setDialog("scoring"); }} onEdit={() => { clearError(); setDialog("score"); }} onEnd={() => setDialog("end")} />
            ) : (
              <span>{active ? `CORRECT +${game.reward} · WRONG −${game.penalty}` : "FIRST TO BUZZ GETS THE FLOOR"}</span>
            )}
          </div>
          {host && game.phase !== "ended" && hostControls()}
          {showingScoreIntro ? <div className="fff-stage fff-countdown" role="status" aria-live="polite"><span>Question in</span><strong>{game.countdown}</strong></div> : (!host || game.phase === "ended") && publicStage()}
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
        {display && active && (
          <aside className="fff-tv-sidebar" aria-label="Rules and top scores">
            <section className="fff-tv-rules">
              <h2>Scoring</h2>
              <p><span>Correct</span><strong>+{game.reward}</strong></p>
              <p><span>Wrong</span><strong>−{game.penalty}</strong></p>
              <p className="fff-tv-early">Early buzz locks you out for this question.</p>
            </section>
            <section className="fff-tv-top-scores">
              <h2>Score Card</h2>
              {players.slice(0, 4).map((player) => (
                <div className="fff-tv-score-row" key={player.id}>
                  <span>{player.rank}.</span>
                  <strong>{nameOf(player.id)}</strong>
                  <b>{player.score}</b>
                </div>
              ))}
            </section>
          </aside>
        )}
        {!display && <aside className={`score-panel ${display ? "fff-tv-score-reveal" : ""} ${showingScoreIntro ? "fff-tv-score-intro" : ""}`}>
          <div className="section-heading">
            <h2>
              {game.phase === "ended" ? "The final scores" : "Score Card"}
            </h2>
            <span>{participants.length} PLAYERS</span>
          </div>
          {showingScoreIntro && <div className="fff-countdown" role="status" aria-live="polite"><span>Question in</span><strong>{game.countdown}</strong></div>}
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
          {host && !display && (
            <a
              className="tv-link"
              href={joinUrl + "&screen=tv"}
              target="_blank"
              rel="noreferrer"
            >
              ▣ Open shared screen ↗
            </a>
          )}
        </aside>}
      </div>
      <footer className="fff-room-code">
        <span>Room code</span> <strong>{session.code}</strong>
      </footer>
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
