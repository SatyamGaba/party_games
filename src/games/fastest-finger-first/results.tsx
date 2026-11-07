import { accuracy, rankedPlayers, resultSlides, type GameView } from "./shared";

export function Results({
  game,
  nameOf,
}: {
  game: GameView;
  nameOf(id: string): string;
}) {
  const players = rankedPlayers(game.stats),
    slides = resultSlides(players.length);
  const slide = slides[Math.min(game.slide, slides.length - 1)];
  const page = players.slice(slide.offset, slide.offset + 8);
  return (
    <section className="fff-results" aria-live="polite">
      <div className="eyebrow">
        THE FINAL WORD · {game.slide + 1} / {slides.length}
      </div>
      <h2>{slide.title}</h2>
      {slide.kind === "spotlight" ? (
        (() => {
          const player = players[slide.offset];
          return (
            <>
              <p className="fff-spotlight-name">{nameOf(player.id)}</p>
              <div className="fff-big-score">
                {player.score}
                <small>POINTS · RANK {player.rank}</small>
              </div>
              <dl className="fff-stat-grid">
                {[
                  ["Correct", player.correct],
                  ["Wrong", player.wrong],
                  ["Accuracy", accuracy(player)],
                  ["Buzzes won", player.buzzes],
                  ["Early lockouts", player.early],
                  [
                    "Score adjustment",
                    (player.adjustment > 0 ? "+" : "") + player.adjustment,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
        })()
      ) : (
        <div className="fff-table-wrap">
          <table className="fff-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                {slide.kind === "standings" ? (
                  <>
                    <th scope="col">Rank</th>
                    <th scope="col">Points</th>
                  </>
                ) : slide.kind === "answers" ? (
                  <>
                    <th scope="col">Correct</th>
                    <th scope="col">Wrong</th>
                    <th scope="col">Accuracy</th>
                  </>
                ) : (
                  <>
                    <th scope="col">Buzzes won</th>
                    <th scope="col">Early lockouts</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {page.map((player) => (
                <tr key={player.id}>
                  <th scope="row">{nameOf(player.id)}</th>
                  {slide.kind === "standings" ? (
                    <>
                      <td>{player.rank}</td>
                      <td className="fff-score-cell">{player.score}</td>
                    </>
                  ) : slide.kind === "answers" ? (
                    <>
                      <td>{player.correct}</td>
                      <td>{player.wrong}</td>
                      <td>{accuracy(player)}</td>
                    </>
                  ) : (
                    <>
                      <td>{player.buzzes}</td>
                      <td>{player.early}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
