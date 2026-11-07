import { randomUUID } from "node:crypto";
import type { Client } from "@colyseus/core";
import { z } from "zod";
import { PartyRoom } from "../../platform/server/party-room";
import { UserError } from "../../lib/errors";
import { saveRound } from "../../storage/database";
import { manifest } from "./manifest";
import { FastestRoomState, Stats } from "./schema";
import { loadPack, listPacks, type LoadedPack } from "./packs";
import {
  calculateStats,
  freshResult,
  lockReason,
  type QuestionResult,
} from "./rules";
import { resultSlides, type Question } from "./shared";

const control = z.object({ revision: z.number().int().nonnegative() });
const points = z.number().int().min(0).max(10000);

export class FastestRoom extends PartyRoom<FastestRoomState> {
  protected allowsDisplay = manifest.tv;
  protected lateJoin = manifest.lateJoin;
  private moderator = "";
  private pack?: LoadedPack;
  private results: QuestionResult[] = [];
  private adjustments: Record<string, number> = {};
  private instanceId = randomUUID();
  private pending = false;

  protected initialState() {
    return new FastestRoomState().assign({ gameId: manifest.id });
  }
  protected acceptsNewPlayers() {
    return ["lobby", "between", "ended"].includes(this.state.game.phase);
  }
  private requireModerator(client: Client) {
    if (
      !this.moderator ||
      this.idOf(client) !== this.moderator ||
      !this.state.players.get(this.moderator)?.connected
    )
      throw new UserError("Only the host can control this game.");
  }
  private action<T extends { revision: number }>(
    name: string,
    schema: z.ZodType<T>,
    handler: (payload: T, client: Client) => void | Promise<void>,
  ) {
    this.registerMessage(name, schema, async (client, payload) => {
      this.requireModerator(client);
      if (this.pending)
        throw new UserError("Please wait for the current action to finish.");
      if (payload.revision !== this.state.game.revision)
        throw new UserError("The game changed. Please try again.");
      this.pending = true;
      try {
        await handler(payload, client);
        this.state.game.revision++;
      } finally {
        this.pending = false;
      }
    });
  }
  protected configure() {
    this.action("refreshPacks", control, async () => {
      if (!this.acceptsNewPlayers())
        throw new UserError("Refresh packs between games or questions.");
      await this.refreshCatalog();
    });
    this.action(
      "newGame",
      control.extend({ pack: z.string().min(1).max(80) }),
      async ({ pack }, client) => {
        if (!["lobby", "ended"].includes(this.state.game.phase))
          throw new UserError("End this game before starting another.");
        const loaded = await loadPack(pack);
        this.requireModerator(client);
        this.pack = loaded;
        this.results = [];
        this.adjustments = {};
        const g = this.state.game;
        g.game++;
        g.phase = "between";
        g.paused = false;
        g.pack = loaded.id;
        g.packTitle = loaded.title;
        g.totalQuestions = loaded.questions.length;
        g.questionNumber = 0;
        g.slide = 0;
        g.stats.clear();
        this.clearQuestion();
        this.syncQuestions();
        this.admitWaiting();
        this.syncStats();
      },
    );
    this.action(
      "startQuestion",
      control.extend({ question: z.string().min(1).max(80) }),
      ({ question }) => {
        const g = this.state.game;
        this.requireRunning();
        if (
          !this.pack ||
          !["between", "ready", "open", "judged", "revealed"].includes(g.phase)
        )
          throw new UserError("Finish judging the current answer first.");
        const next = this.pack.questions.find((q) => q.id === question);
        if (!next || this.results.some((r) => r.id === question))
          throw new UserError("Choose an unplayed question.");
        if (
          ![...this.state.players.values()].some(
            (p) =>
              p.role === "player" &&
              p.id !== this.moderator &&
              p.connected &&
              !p.departed,
          )
        )
          throw new UserError("At least one player must be connected.");
        // Admit late arrivals only at this explicit new-question boundary.
        g.phase = "between";
        this.admitWaiting();
        this.syncStats();
        this.results.push(freshResult(next.id, next.reward, next.penalty));
        g.roster.clear();
        g.roster.push(
          ...this.connectedPlayers()
            .filter((p) => p.id !== this.moderator)
            .map((p) => p.id),
        );
        g.questionId = next.id;
        g.questionNumber = this.results.length;
        g.questionType = next.type;
        g.text = next.text;
        g.mediaUrl = next.media ? this.pack.media.get(next.media)! : "";
        g.mediaStart = next.start;
        g.mediaEnd = next.end ?? 0;
        g.mediaEpoch++;
        g.reward = next.reward;
        g.penalty = next.penalty;
        g.answer = "";
        g.answering = "";
        g.verdict = "";
        g.locks.clear();
        g.host.prompt = next.prompt;
        g.host.answer = next.answer;
        g.phase = "ready";
        this.newScope();
        this.syncQuestions();
      },
    );
    this.action("openBuzzers", control, () => {
      this.requireRunning();
      if (this.state.game.phase !== "ready")
        throw new UserError("Start or reopen a question first.");
      this.state.game.phase = "open";
      this.newScope();
    });
    this.registerMessage(
      "buzz",
      z.object({ scope: z.string().min(1).max(80) }),
      (client, { scope }) => {
        const g = this.state.game;
        const player = this.requirePlayer(client);
        if (player.id === this.moderator)
          throw new UserError("The host does not play.");
        this.requireRunning();
        if (scope !== g.scope)
          throw new UserError("That buzzer race has ended.");
        if (!g.roster.includes(player.id))
          throw new UserError("You'll join the next question.");
        const result = this.currentResult();
        if (lockReason(result, player.id))
          throw new UserError("You're locked out for this question.");
        // Late simultaneous buzzes and retries never become an early buzz for the next race.
        if (["answering", "judged"].includes(g.phase)) return;
        if (g.phase === "ready") {
          result.early.push(player.id);
          this.syncStats();
          this.syncLocks();
          return;
        }
        if (g.phase !== "open") throw new UserError("Buzzers are closed.");
        result.buzzes.push(player.id);
        g.answering = player.id;
        g.phase = "answering";
        this.syncStats();
        g.revision++;
      },
    );
    this.action(
      "judge",
      control.extend({ correct: z.boolean() }),
      ({ correct }) => {
        this.requireRunning();
        const g = this.state.game;
        if (g.phase !== "answering" || !g.answering)
          throw new UserError("Nobody is answering.");
        this.currentResult().attempts.push({ player: g.answering, correct });
        g.verdict = correct ? "Correct" : "Wrong";
        g.phase = "judged";
        this.syncStats();
        this.syncLocks();
      },
    );
    this.action("reopen", control, () => {
      this.requireRunning();
      const g = this.state.game;
      if (g.phase !== "judged" || g.verdict !== "Wrong")
        throw new UserError("Only a wrong answer can reopen the question.");
      g.phase = "ready";
      g.answering = "";
      g.verdict = "";
      g.mediaEpoch++;
      this.newScope();
    });
    this.action("undo", control, () => {
      this.requireRunning();
      const g = this.state.game;
      if (g.phase !== "judged")
        throw new UserError(
          "Only the latest verdict on this question can be undone.",
        );
      this.currentResult().attempts.pop();
      g.phase = "ready";
      g.answering = "";
      g.verdict = "";
      g.mediaEpoch++;
      this.newScope();
      this.syncStats();
      this.syncLocks();
    });
    this.action("reveal", control, () => {
      this.requireRunning();
      const g = this.state.game;
      if (!["ready", "open", "judged"].includes(g.phase))
        throw new UserError("Finish judging the answer before revealing.");
      g.answer = g.host.answer;
      g.phase = "revealed";
      g.answering = "";
      this.newScope();
    });
    this.action(
      "scoring",
      control.extend({ reward: points, penalty: points }),
      ({ reward, penalty }) => {
        this.requireRunning();
        if (this.state.game.phase === "revealed")
          throw new UserError(
            "This question is complete. Start another question to change points.",
          );
        const result = this.currentResult();
        result.reward = reward;
        result.penalty = penalty;
        this.state.game.reward = reward;
        this.state.game.penalty = penalty;
        this.syncStats();
      },
    );
    this.action(
      "editScore",
      control.extend({
        player: z.string(),
        total: z.number().int().min(-1000000).max(1000000),
      }),
      ({ player, total }) => {
        if (["lobby", "ended"].includes(this.state.game.phase))
          throw new UserError("Edit scores during an active game.");
        const stats = this.state.game.stats.get(player);
        if (!stats) throw new UserError("Choose a player in this game.");
        this.adjustments[player] =
          (this.adjustments[player] ?? 0) + total - stats.score;
        this.syncStats();
      },
    );
    this.action("pause", control, () => {
      if (["lobby", "ended"].includes(this.state.game.phase))
        throw new UserError("No active game to pause.");
      this.pause();
    });
    this.action("resume", control, () => {
      const g = this.state.game;
      if (!g.paused) throw new UserError("The game is not paused.");
      g.paused = false;
      g.mediaEpoch++;
      this.newScope();
    });
    this.action("endGame", control, () => {
      if (["lobby", "ended"].includes(this.state.game.phase))
        throw new UserError("No active game to end.");
      const g = this.state.game;
      g.phase = "ended";
      g.paused = false;
      g.slide = 0;
      this.newScope();
      this.saveResults();
    });
    this.action(
      "slide",
      control.extend({ index: z.number().int().min(0) }),
      ({ index }) => {
        const g = this.state.game;
        if (g.phase !== "ended" || index >= resultSlides(g.stats.size).length)
          throw new UserError("That results slide is unavailable.");
        g.slide = index;
      },
    );
  }
  private requireRunning() {
    const g = this.state.game;
    if (g.paused) throw new UserError("The host has paused the game.");
    if (["lobby", "ended"].includes(g.phase))
      throw new UserError("Start a game first.");
  }
  private currentResult() {
    const result = this.results.at(-1);
    if (!result || result.id !== this.state.game.questionId)
      throw new UserError("Start a question first.");
    return result;
  }
  private newScope() {
    this.state.game.scope = randomUUID();
  }
  private pause() {
    const g = this.state.game;
    g.paused = true;
    if (g.phase === "open") g.phase = "ready";
    this.newScope();
  }
  private clearQuestion() {
    const g = this.state.game;
    g.questionId = "";
    g.text = "";
    g.mediaUrl = "";
    g.answer = "";
    g.answering = "";
    g.verdict = "";
    g.host.prompt = "";
    g.host.answer = "";
    g.locks.clear();
    g.roster.clear();
    this.newScope();
  }
  private syncQuestions() {
    this.state.game.host.questions = JSON.stringify(
      this.pack?.questions.map((q: Question) => ({
        ...q,
        mediaUrl: q.media ? this.pack!.media.get(q.media) : "",
        played: this.results.some((r) => r.id === q.id),
      })) ?? [],
    );
  }
  private syncStats() {
    const g = this.state.game;
    if (!g.game) return;
    const ids = new Set([
      ...g.stats.keys(),
      ...this.connectedPlayers()
        .filter((p) => p.id !== this.moderator)
        .map((p) => p.id),
    ]);
    const stats = calculateStats([...ids], this.results, this.adjustments);
    for (const [id, values] of Object.entries(stats)) {
      let entry = g.stats.get(id);
      if (!entry) {
        entry = new Stats();
        g.stats.set(id, entry);
      }
      entry.assign(values);
    }
  }
  private syncLocks() {
    const g = this.state.game,
      result = this.currentResult();
    g.locks.clear();
    for (const id of g.roster) {
      const reason = lockReason(result, id);
      if (reason) g.locks.set(id, reason);
    }
  }
  private async refreshCatalog() {
    try {
      const catalog = await listPacks();
      this.state.game.host.catalog = JSON.stringify(catalog.packs);
      this.state.game.host.error = catalog.errors.join(" ");
    } catch {
      this.state.game.host.error =
        "Could not read packs. Check PACKS_DIR and folder permissions.";
    }
  }
  private saveResults() {
    const g = this.state.game;
    saveRound(this.instanceId, this.roomId, g.game, {
      game: manifest.id,
      pack: g.pack,
      packTitle: g.packTitle,
      players: Object.fromEntries(
        [...g.stats.keys()].map((id) => [
          id,
          this.state.players.get(id)?.name ?? "Player",
        ]),
      ),
      stats: g.stats.toJSON(),
      questions: this.results,
      adjustments: this.adjustments,
    });
  }
  protected participantJoined(client: Client, id: string) {
    if (!this.moderator && this.state.players.get(id)?.role === "player") {
      this.moderator = id;
      this.state.hostId = id;
      void this.refreshCatalog();
    }
    if (id === this.moderator) client.view?.add(this.state.game.host);
    this.syncStats();
  }
  protected participantDropped(id: string) {
    if (
      id === this.moderator &&
      !["lobby", "ended"].includes(this.state.game.phase)
    ) {
      this.pause();
      this.state.game.revision++;
    }
  }
  protected participantLeft(id: string) {
    if (id === this.moderator) {
      // Base lifecycle normally transfers the host; this game must never expose answers to a player.
      this.state.hostId = this.moderator;
      this.participantDropped(id);
    }
  }
}
