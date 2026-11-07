import { describe, expect, it } from "vitest";
import {
  calculateStats,
  freshResult,
  lockReason,
} from "../src/games/fastest-finger-first/rules";
import {
  accuracy,
  rankedPlayers,
  resultSlides,
} from "../src/games/fastest-finger-first/shared";

describe("Fastest Finger First scoring ledger", () => {
  it("recalculates question values without losing manual corrections or changing other questions", () => {
    const first = freshResult("one", 10, 5),
      second = freshResult("two", 20, 8);
    first.attempts.push(
      { player: "alice", correct: false },
      { player: "bob", correct: true },
    );
    first.early.push("cara");
    first.buzzes.push("alice", "bob");
    second.attempts.push({ player: "alice", correct: true });
    first.penalty = 7;
    first.reward = 15;
    const stats = calculateStats(["alice", "bob", "cara"], [first, second], {
      alice: 3,
    });
    expect(stats.alice).toEqual({
      score: 16,
      adjustment: 3,
      correct: 1,
      wrong: 1,
      early: 0,
      buzzes: 1,
    });
    expect(stats.bob.score).toBe(15);
    expect(stats.cara.score).toBe(0);
    expect(lockReason(first, "cara")).toBe("Early buzz");
    expect(lockReason(first, "alice")).toBe("Wrong answer");
    expect(lockReason(second, "alice")).toBe("");
    first.attempts.pop();
    expect(calculateStats(["bob"], [first], {}).bob.score).toBe(0);
    expect(accuracy(stats.alice)).toBe("50%");
    expect(accuracy(stats.cara)).toBe("—");
  });
  it("shares ranks and includes every player on paginated slides", () => {
    const stats = calculateStats(["a", "b", "c"], [], { a: 20, b: 20, c: 10 });
    expect(rankedPlayers(stats).map((p) => p.rank)).toEqual([1, 1, 3]);
    const slides = resultSlides(49);
    expect(slides.filter((s) => s.kind === "standings")).toHaveLength(7);
    expect(slides.filter((s) => s.kind === "spotlight")).toHaveLength(49);
  });
});
