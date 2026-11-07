export type Phase =
  | "lobby"
  | "ready"
  | "open"
  | "answering"
  | "judged"
  | "revealed"
  | "between"
  | "ended";
export type QuestionKind = "text" | "image" | "audio" | "video";
export interface Question {
  id: string;
  prompt: string;
  answer: string;
  text: string;
  type: QuestionKind;
  media?: string;
  start: number;
  end?: number;
  reward: number;
  penalty: number;
}
export interface PackInfo {
  id: string;
  title: string;
  count: number;
}
export interface QuestionInfo {
  id: string;
  prompt: string;
  type: QuestionKind;
  played: boolean;
}
export interface PlayerStats {
  score: number;
  adjustment: number;
  correct: number;
  wrong: number;
  early: number;
  buzzes: number;
}
export interface GameView {
  phase: Phase;
  paused: boolean;
  revision: number;
  scope: string;
  game: number;
  pack: string;
  packTitle: string;
  questionId: string;
  questionNumber: number;
  totalQuestions: number;
  questionType: QuestionKind;
  text: string;
  mediaUrl: string;
  mediaStart: number;
  mediaEnd: number;
  mediaEpoch: number;
  answer: string;
  answering: string;
  verdict: string;
  reward: number;
  penalty: number;
  slide: number;
  roster: string[];
  locks: Record<string, string>;
  stats: Record<string, PlayerStats>;
  host?: {
    catalog: string;
    questions: string;
    prompt: string;
    answer: string;
    error: string;
  };
}
export function rankedPlayers(stats: Record<string, PlayerStats>) {
  const sorted = Object.entries(stats).sort(
    ([a, x], [b, y]) => y.score - x.score || a.localeCompare(b),
  );
  return sorted.map(([id, value], index) => ({
    id,
    ...value,
    rank: sorted.findIndex(([, other]) => other.score === value.score) + 1,
    position: index,
  }));
}
export function accuracy(stats: PlayerStats) {
  const attempts = stats.correct + stats.wrong;
  return attempts ? Math.round((stats.correct / attempts) * 100) + "%" : "—";
}

export function resultSlides(playerCount: number) {
  const slides: {
    kind: "standings" | "answers" | "buzzers" | "spotlight";
    title: string;
    offset: number;
  }[] = [];
  for (const [kind, title] of [
    ["standings", "Final standings"],
    ["answers", "The answer sheet"],
    ["buzzers", "On the buzzer"],
  ] as const) {
    const pages = Math.max(1, Math.ceil(playerCount / 8));
    for (let page = 0; page < pages; page++)
      slides.push({
        kind,
        title: title + (pages > 1 ? ` · ${page + 1}/${pages}` : ""),
        offset: page * 8,
      });
  }
  for (let index = 0; index < playerCount; index++)
    slides.push({
      kind: "spotlight",
      title: "Player spotlight",
      offset: index,
    });
  return slides;
}
