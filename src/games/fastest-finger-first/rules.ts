import type { PlayerStats } from "./shared";

export interface Attempt {
  player: string;
  correct: boolean;
}
export interface QuestionResult {
  id: string;
  reward: number;
  penalty: number;
  attempts: Attempt[];
  early: string[];
  buzzes: string[];
}
export function freshResult(
  id: string,
  reward: number,
  penalty: number,
): QuestionResult {
  return { id, reward, penalty, attempts: [], early: [], buzzes: [] };
}
export function lockReason(question: QuestionResult, player: string) {
  if (question.early.includes(player)) return "Early buzz";
  if (question.attempts.some((a) => a.player === player && !a.correct))
    return "Wrong answer";
  return "";
}
/** Derive totals from the ledger, keeping manual corrections independent of question values. */
export function calculateStats(
  players: string[],
  questions: QuestionResult[],
  adjustments: Record<string, number>,
) {
  const stats: Record<string, PlayerStats> = {};
  for (const id of players)
    stats[id] = {
      score: adjustments[id] ?? 0,
      adjustment: adjustments[id] ?? 0,
      correct: 0,
      wrong: 0,
      early: 0,
      buzzes: 0,
    };
  for (const question of questions) {
    for (const id of question.early) if (stats[id]) stats[id].early++;
    for (const id of question.buzzes) if (stats[id]) stats[id].buzzes++;
    for (const attempt of question.attempts) {
      const player = stats[attempt.player];
      if (!player) continue;
      if (attempt.correct) {
        player.correct++;
        player.score += question.reward;
      } else {
        player.wrong++;
        player.score -= question.penalty;
      }
    }
  }
  return stats;
}
