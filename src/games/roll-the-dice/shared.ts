export type Phase = "lobby" | "betting" | "rolling" | "result";
export interface DiceView {
  phase: Phase;
  round: number;
  roster: string[];
  locked: string[];
  skipped: string[];
  ownAnswer: number | null;
  result: number | null;
  bets: Record<string, number> | null;
  scores: Record<string, number>;
  revealAt: number | null;
}
