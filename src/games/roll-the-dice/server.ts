import { randomInt, randomUUID } from "node:crypto";
import type { Client, Delayed } from "@colyseus/core";
import { z } from "zod";
import { PartyRoom } from "../../platform/server/party-room";
import { SubmissionLedger } from "../../platform/server/submissions";
import { submissionSchema } from "../../platform/validation";
import { UserError } from "../../lib/errors";
import { saveRound } from "../../storage/database";
import { DiceRoomState, Guess } from "./schema";
import { manifest } from "./manifest";
const answerSchema = z.number().int().min(1).max(6);
export class DiceRoom extends PartyRoom<DiceRoomState> {
  protected allowsDisplay = manifest.tv;
  protected lateJoin = manifest.lateJoin;
  protected rollDelayMs = 2800;
  protected acceptsNewPlayers() {
    const phase = this.state.game.phase;
    return phase === "lobby" || phase === "result";
  }
  private submissions = new SubmissionLedger();
  private result: number | null = null;
  private instanceId = randomUUID();
  protected initialState() {
    return new DiceRoomState().assign({ gameId: manifest.id });
  }
  protected configure() {
    this.registerMessage("start", z.object({}), (client) => {
      this.requireHost(client);
      const game = this.state.game;
      if (game.phase !== "lobby" && game.phase !== "result")
        throw new UserError("A round is already in progress.");
      const players = this.connectedPlayers();
      if (!players.length)
        throw new UserError("At least one player must be connected.");
      game.round++;
      game.phase = "betting";
      game.result = 0;
      game.revealAt = 0;
      game.roster.clear();
      game.roster.push(...players.map((p) => p.id));
      game.skipped.clear();
      for (const [id, guess] of game.guesses)
        this.clientOf(id)?.view?.remove(guess);
      game.guesses.clear();
      this.submissions.clear();
      this.result = null;
      for (const player of players) {
        const guess = new Guess();
        game.guesses.set(player.id, guess);
        this.clientOf(player.id)?.view?.add(guess);
      }
    });
    this.registerMessage(
      "submit",
      submissionSchema.extend({ answer: answerSchema }),
      (client, payload) => {
        const id = this.requirePlayer(client).id;
        const game = this.state.game;
        if (payload.scope !== String(game.round))
          throw new UserError("That round has ended.");
        if (this.submissions.check(id, payload.submissionId, payload.answer))
          return;
        if (game.phase !== "betting")
          throw new UserError("Answers are closed.");
        if (!game.roster.includes(id) || game.skipped.includes(id))
          throw new UserError("You'll join the next round.");
        const guess = game.guesses.get(id)!;
        guess.value = payload.answer;
        guess.locked = true;
        this.submissions.accept(id, payload.submissionId, payload.answer);
        this.maybeRoll();
      },
    );
  }
  /**
   * A player keeps their seat for minutes, but the round shouldn't stall that
   * long: an unanswered guess is skipped after this grace period.
   */
  protected turnGraceMs = 30_000;
  private graceTimers = new Map<string, Delayed>();
  protected participantJoined(client: Client, id: string) {
    this.graceTimers.get(id)?.clear();
    this.graceTimers.delete(id);
    const ownGuess = this.state.game.guesses.get(id);
    if (ownGuess) client.view?.add(ownGuess);
  }
  protected participantDropped(id: string) {
    this.graceTimers.get(id)?.clear();
    this.graceTimers.set(
      id,
      this.clock.setTimeout(() => {
        this.graceTimers.delete(id);
        this.participantLeft(id);
      }, this.turnGraceMs),
    );
  }
  protected participantLeft(id: string) {
    const game = this.state.game;
    if (
      game.phase === "betting" &&
      game.roster.includes(id) &&
      !game.guesses.get(id)?.locked &&
      !game.skipped.includes(id)
    ) {
      game.skipped.push(id);
      this.maybeRoll();
    }
  }
  protected roll() {
    return randomInt(1, 7);
  }
  private maybeRoll() {
    const game = this.state.game;
    if (game.phase !== "betting") return;
    const eligible = game.roster.filter((id) => !game.skipped.includes(id));
    if (!eligible.length) {
      game.phase = "lobby";
      return;
    }
    if (!eligible.every((id) => game.guesses.get(id)?.locked)) return;
    this.result = this.roll();
    game.phase = "rolling";
    game.revealAt = Date.now() + this.rollDelayMs;
    this.clock.setTimeout(() => this.reveal(), this.rollDelayMs);
  }
  private reveal() {
    const game = this.state.game;
    if (game.phase !== "rolling" || this.result === null) return;
    game.result = this.result;
    for (const [id, guess] of game.guesses) {
      if (!guess.locked) continue;
      guess.revealedValue = guess.value;
      if (guess.value === this.result)
        game.scores.set(id, (game.scores.get(id) ?? 0) + 10);
    }
    game.phase = "result";
    saveRound(this.instanceId, this.roomId, game.round, {
      result: game.result,
      scores: Object.fromEntries(game.scores),
      guesses: Object.fromEntries(
        [...game.guesses]
          .filter(([, g]) => g.locked)
          .map(([id, g]) => [id, g.revealedValue]),
      ),
    });
  }
}
