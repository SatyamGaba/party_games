import { randomInt, randomUUID } from "node:crypto";
import type { Client, Delayed } from "@colyseus/core";
import { z } from "zod";
import { PartyRoom } from "../../platform/server/party-room";
import { UserError } from "../../lib/errors";
import { saveRound } from "../../storage/database";
import { manifest } from "./manifest";
import {
  CATEGORIES,
  DISCUSSION_SECONDS,
  LIMITS,
  POINTS,
  TURN_SECONDS,
  allSplits,
  deal,
  leaksWord,
  pairKey,
  sameWord,
  suggestedSplit,
  topVoted,
  validSplit,
  winner,
  type Role,
  type Split,
  type WordPair,
} from "./rules";
import {
  Ballot,
  Card,
  Clue,
  Reveal,
  RoleCard,
  UndercoverRoomState,
} from "./schema";
import { BUILT_IN_PAIRS } from "./words";

const settingsSchema = z
  .object({
    clueMode: z.enum(["spoken", "typed"]),
    turnSeconds: z.number().refine((v) => (TURN_SECONDS as readonly number[]).includes(v)),
    discussionSeconds: z
      .number()
      .refine((v) => (DISCUSSION_SECONDS as readonly number[]).includes(v)),
    moderatorView: z.enum(["reveal", "hide"]),
    splitMode: z.enum(["suggested", "custom", "random"]),
    undercover: z.number().int().min(0).max(19),
    white: z.number().int().min(0).max(1),
    categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  })
  .partial();
const targetSchema = z.object({ target: z.string().min(1).max(80) });
const textSchema = (max: number) =>
  z.object({ text: z.string().trim().min(1, "Type something first.").max(max) });

/** Phases: lobby → cards → describe → discuss → vote → verdict → (guess) → … → ended. */
export class UndercoverRoom extends PartyRoom<UndercoverRoomState> {
  protected allowsDisplay = manifest.tv;
  protected lateJoin = manifest.lateJoin;
  /** Overridable in tests. */
  protected secondMs = 1000;
  protected cardsMs = 15_000;
  protected verdictMs = 6_000;
  protected guessMs = 60_000;
  /** A disconnected speaker's turn passes after this when the turn has no time limit. */
  protected awayTurnMs = 20_000;
  protected random(n: number) {
    return randomInt(n);
  }

  private usedPairs = new Set<string>();
  private roles = new Map<string, Role>();
  private votes = new Map<string, string>();
  private timer?: Delayed;
  private instanceId = randomUUID();

  protected acceptsNewPlayers() {
    const phase = this.state.game.phase;
    return phase === "lobby" || phase === "ended";
  }
  protected initialState() {
    return new UndercoverRoomState().assign({ gameId: manifest.id });
  }

  protected configure() {
    this.registerMessage("settings", settingsSchema, (client, patch) => {
      this.requireModerator(client);
      this.requireBetweenGames();
      const s = this.state.game.settings;
      for (const [key, value] of Object.entries(patch)) {
        if (key === "categories") {
          s.categories.clear();
          s.categories.push(...(value as string[]));
        } else (s as unknown as Record<string, unknown>)[key] = value;
      }
    });
    this.registerMessage("start", z.object({}), (client) => {
      this.requireModerator(client);
      this.requireBetweenGames();
      this.startGame();
    });
    this.registerMessage("ready", z.object({}), (client) => {
      const id = this.requireInGame(client);
      const game = this.state.game;
      if (game.phase !== "cards") return;
      if (!game.ready.includes(id)) game.ready.push(id);
      if (this.alive().every((p) => game.ready.includes(p) || !this.isConnected(p)))
        this.beginRound();
    });
    this.registerMessage("clue", textSchema(LIMITS.clue), (client, { text }) => {
      const id = this.requireSpeaker(client);
      if (this.state.game.settings.clueMode !== "typed")
        throw new UserError("Clues are spoken out loud in this game.");
      const word = this.state.game.cards.get(id)?.word ?? "";
      if (word && leaksWord(text, word))
        throw new UserError("Your clue can't contain your own word.");
      this.endTurn(text);
    });
    this.registerMessage("done", z.object({}), (client) => {
      this.requireSpeaker(client);
      if (this.state.game.settings.clueMode !== "spoken")
        throw new UserError("Type your clue to finish your turn.");
      this.endTurn("");
    });
    this.registerMessage("skipTurn", z.object({}), (client) => {
      this.requireModerator(client);
      if (this.state.game.phase !== "describe")
        throw new UserError("Nobody is describing right now.");
      this.endTurn("");
    });
    this.registerMessage("openVote", z.object({}), (client) => {
      this.requireModerator(client);
      if (this.state.game.phase !== "discuss")
        throw new UserError("The vote can only open after Discussion starts.");
      this.openVote(false, []);
    });
    this.registerMessage("vote", targetSchema, (client, { target }) => {
      const id = this.requireInGame(client);
      const game = this.state.game;
      if (game.phase !== "vote") throw new UserError("Voting is closed.");
      if (target === id) throw new UserError("You can't vote for yourself.");
      if (!this.candidates().includes(target))
        throw new UserError("That player can't be voted for.");
      this.votes.set(id, target);
      const ballot = game.ballots.get(id)!;
      ballot.cast = true;
      ballot.target = target;
      this.maybeCloseVote();
    });
    this.registerMessage("closeVote", z.object({}), (client) => {
      this.requireModerator(client);
      if (this.state.game.phase !== "vote") throw new UserError("Voting is closed.");
      this.closeVote();
    });
    this.registerMessage("guess", textSchema(LIMITS.guess), (client, { text }) => {
      const id = this.idOf(client);
      const game = this.state.game;
      if (game.phase !== "guess" || game.guessBy !== id)
        throw new UserError("Only the ousted Mr. White can guess now.");
      this.resolveGuess(text);
    });
  }

  // ---------- helpers ----------

  /** The host is always a phone: a shared screen that created the room cannot run it. */
  private requireModerator(client: Client) {
    if (this.idOf(client) === this.state.screenId)
      throw new UserError("Run the game from the host's phone.");
    this.requireHost(client);
  }
  private requireBetweenGames() {
    if (!this.acceptsNewPlayers()) throw new UserError("A game is in progress.");
  }
  private requireInGame(client: Client) {
    const id = this.requirePlayer(client).id;
    if (!this.alive().includes(id))
      throw new UserError(
        this.state.game.roster.includes(id)
          ? "You've been ousted. Enjoy the show!"
          : "You'll play in the next game.",
      );
    return id;
  }
  private requireSpeaker(client: Client) {
    const id = this.requireInGame(client);
    const game = this.state.game;
    if (game.phase !== "describe" || game.order[game.turn] !== id)
      throw new UserError("It's not your turn.");
    return id;
  }
  private isConnected(id: string) {
    return this.state.players.get(id)?.connected === true;
  }
  /** Roster players not yet ousted, in seat order. */
  private alive() {
    const game = this.state.game;
    return game.roster.filter((id) => !game.out.includes(id));
  }
  private candidates() {
    const game = this.state.game;
    return game.candidates.length ? [...game.candidates] : this.alive();
  }
  private schedule(ms: number, fn: () => void) {
    this.timer?.clear();
    this.timer = ms > 0 ? this.clock.setTimeout(fn, ms) : undefined;
    this.state.game.deadline = ms > 0 ? Date.now() + ms : 0;
  }
  /** Removes a schema object from every connection's view before it is discarded. */
  private hide(obj: object) {
    for (const c of this.clients)
      if (c.view?.has(obj as never)) c.view.remove(obj as never);
  }
  /** The host sees roles only when moderating (not playing) in Reveal-roles mode. */
  private moderates(id: string) {
    const game = this.state.game;
    return (
      id === this.state.hostId &&
      game.settings.moderatorView === "reveal" &&
      !game.roster.includes(id)
    );
  }
  private showSecrets(client: Client, id: string) {
    const game = this.state.game;
    const own = game.cards.get(id);
    if (own) client.view?.add(own);
    const ballot = game.ballots.get(id);
    if (ballot) client.view?.add(ballot);
    if (this.moderates(id)) {
      for (const card of game.cards.values()) client.view?.add(card);
      for (const role of game.roles.values()) client.view?.add(role);
      for (const b of game.ballots.values()) client.view?.add(b);
    }
  }

  // ---------- game flow ----------

  private pickSplit(players: number): Split {
    const s = this.state.game.settings;
    if (s.splitMode === "random") {
      const options = allSplits(players);
      return options[this.random(options.length)];
    }
    if (s.splitMode === "custom") {
      const split = { undercover: s.undercover, white: s.white };
      if (!validSplit(players, split))
        throw new UserError(
          `${split.undercover} Undercover + ${split.white} Mr. White doesn't work for ${players} players. Civilians must outnumber Infiltrators.`,
        );
      return split;
    }
    return suggestedSplit(players);
  }

  private pickPair(): WordPair {
    const s = this.state.game.settings;
    const pool = BUILT_IN_PAIRS.filter(
      (p) => !s.categories.length || s.categories.includes(p.category),
    );
    let fresh = pool.filter((p) => !this.usedPairs.has(pairKey(p)));
    if (!fresh.length) {
      for (const p of pool) this.usedPairs.delete(pairKey(p));
      fresh = pool;
    }
    const pair = fresh[this.random(fresh.length)];
    this.usedPairs.add(pairKey(pair));
    return pair;
  }

  private startGame() {
    const game = this.state.game;
    const players = this.connectedPlayers()
      .filter((p) => p.id !== this.state.hostId)
      .map((p) => p.id);
    if (players.length < manifest.minPlayers)
      throw new UserError(
        `Undercover needs at least ${manifest.minPlayers} players besides the host.`,
      );
    if (players.length > manifest.maxPlayers)
      throw new UserError(`Undercover fits at most ${manifest.maxPlayers} players.`);
    const split = this.pickSplit(players.length);
    const pair = this.pickPair();
    const [civilianWord, undercoverWord] =
      this.random(2) ? [pair.a, pair.b] : [pair.b, pair.a];

    for (const obj of [...game.cards.values(), ...game.roles.values(), ...game.ballots.values()])
      this.hide(obj);
    game.cards.clear();
    game.roles.clear();
    game.ballots.clear();
    for (const list of [game.roster, game.out, game.ready, game.order, game.candidates, game.winners])
      list.clear();
    game.clues.clear();
    game.revealed.clear();
    game.tally.clear();
    game.lastVotes.clear();
    game.final.clear();
    this.votes.clear();
    Object.assign(game, {
      game: game.game + 1,
      round: 0,
      turn: 0,
      tieBreak: false,
      outcome: "",
      lastOusted: "",
      guessBy: "",
      guessText: "",
      guessCorrect: false,
      winningSide: "",
      civilianWord: "",
      undercoverWord: "",
    });

    this.roles = new Map(Object.entries(deal(players, split, (n) => this.random(n))));
    game.roster.push(...players);
    for (const id of players) {
      const role = this.roles.get(id)!;
      game.cards.set(
        id,
        new Card().assign({
          word: role === "civilian" ? civilianWord : role === "undercover" ? undercoverWord : "",
          white: role === "white",
        }),
      );
      game.roles.set(id, new RoleCard().assign({ role }));
    }
    this.words = { civilianWord, undercoverWord };
    for (const c of this.clients) this.showSecrets(c, this.idOf(c));
    game.phase = "cards";
    this.schedule(this.cardsMs, () => this.beginRound());
  }
  private words = { civilianWord: "", undercoverWord: "" };

  private beginRound() {
    const game = this.state.game;
    const alive = this.alive();
    const speakers = alive.filter((id) => this.roles.get(id) !== "white");
    const first = speakers[this.random(speakers.length)] ?? alive[0];
    const start = alive.indexOf(first);
    game.round++;
    game.order.clear();
    game.order.push(...alive.slice(start), ...alive.slice(0, start));
    game.turn = 0;
    game.phase = "describe";
    this.startTurn();
  }

  private startTurn() {
    const game = this.state.game;
    const id = game.order[game.turn];
    const ms = game.settings.turnSeconds * this.secondMs;
    this.schedule(ms || (this.isConnected(id) ? 0 : this.awayTurnMs), () =>
      this.endTurn(""),
    );
  }

  private endTurn(text: string) {
    const game = this.state.game;
    if (game.phase !== "describe") return;
    game.clues.push(
      new Clue().assign({
        round: game.round,
        by: game.order[game.turn],
        text,
        skipped: !text && game.settings.clueMode === "typed",
      }),
    );
    // Skip anyone ousted (departed) since the order was set.
    do game.turn++;
    while (game.turn < game.order.length && game.out.includes(game.order[game.turn]));
    if (game.turn < game.order.length) return this.startTurn();
    game.phase = "discuss";
    this.schedule(game.settings.discussionSeconds * this.secondMs, () =>
      this.openVote(false, []),
    );
  }

  private openVote(tieBreak: boolean, candidates: string[]) {
    const game = this.state.game;
    for (const b of game.ballots.values()) this.hide(b);
    game.ballots.clear();
    this.votes.clear();
    game.tieBreak = tieBreak;
    game.candidates.clear();
    game.candidates.push(...candidates);
    for (const id of this.alive()) game.ballots.set(id, new Ballot());
    for (const c of this.clients) this.showSecrets(c, this.idOf(c));
    game.phase = "vote";
    this.schedule(0, () => undefined);
    this.maybeCloseVote();
  }

  private maybeCloseVote() {
    const game = this.state.game;
    if (game.phase !== "vote") return;
    const pending = this.alive().filter(
      (id) => this.isConnected(id) && !this.votes.has(id),
    );
    if (!pending.length) this.closeVote();
  }

  private closeVote() {
    const game = this.state.game;
    const votes = Object.fromEntries(
      [...this.votes].filter(([voter]) => this.alive().includes(voter)),
    );
    const { tally, top } = topVoted(votes);
    game.tally.clear();
    for (const [id, n] of Object.entries(tally)) game.tally.set(id, n);
    game.lastVotes.clear();
    for (const [voter, target] of Object.entries(votes)) game.lastVotes.set(voter, target);
    if (top.length > 1 && !game.tieBreak) {
      game.outcome = "tie";
      return this.openVote(true, top);
    }
    if (top.length !== 1) {
      game.outcome = "nobody";
      game.lastOusted = "";
      return this.verdict();
    }
    const ousted = top[0];
    game.outcome = "ousted";
    game.lastOusted = ousted;
    game.out.push(ousted);
    const role = this.roles.get(ousted)!;
    game.revealed.set(ousted, role);
    if (role === "white") {
      game.phase = "guess";
      game.guessBy = ousted;
      game.guessText = "";
      this.schedule(this.isConnected(ousted) ? this.guessMs : this.awayTurnMs, () =>
        this.resolveGuess(""),
      );
      return;
    }
    this.verdict();
  }

  private resolveGuess(text: string) {
    const game = this.state.game;
    if (game.phase !== "guess") return;
    game.guessText = text;
    game.guessCorrect = sameWord(text, this.words.civilianWord);
    if (game.guessCorrect) return this.end("white", [game.guessBy]);
    this.verdict();
  }

  /** Shows the Vote result briefly, then either ends the game or starts the next round. */
  private verdict() {
    const game = this.state.game;
    if (this.checkWin()) return;
    game.phase = "verdict";
    this.schedule(this.verdictMs, () => this.beginRound());
  }

  private checkWin() {
    const alive = this.alive();
    const side = winner(alive.map((id) => this.roles.get(id)!));
    if (!side) return false;
    const game = this.state.game;
    const ids =
      side === "civilians"
        ? game.roster.filter((id) => this.roles.get(id) === "civilian")
        : alive.filter((id) => this.roles.get(id) !== "civilian");
    this.end(side, ids);
    return true;
  }

  private end(side: string, winners: string[]) {
    const game = this.state.game;
    this.schedule(0, () => undefined);
    game.winningSide = side;
    game.winners.push(...winners);
    for (const id of winners) {
      const points = POINTS[this.roles.get(id)!];
      game.scores.set(id, (game.scores.get(id) ?? 0) + points);
    }
    for (const id of game.roster) {
      const role = this.roles.get(id)!;
      game.final.set(
        id,
        new Reveal().assign({ role, word: game.cards.get(id)?.word ?? "" }),
      );
    }
    game.civilianWord = this.words.civilianWord;
    game.undercoverWord = this.words.undercoverWord;
    game.phase = "ended";
    saveRound(this.instanceId, this.roomId, game.game, {
      game: "undercover",
      winningSide: side,
      winners,
      words: this.words,
      roles: Object.fromEntries(this.roles),
      scores: Object.fromEntries(game.scores),
    });
  }

  // ---------- connections ----------

  protected participantJoined(client: Client, id: string) {
    this.showSecrets(client, id);
    const game = this.state.game;
    if (game.phase === "describe" && game.order[game.turn] === id && !game.settings.turnSeconds)
      this.schedule(0, () => undefined);
  }

  protected participantDropped(id: string) {
    const game = this.state.game;
    if (game.phase === "describe" && game.order[game.turn] === id && !game.settings.turnSeconds)
      this.schedule(this.awayTurnMs, () => this.endTurn(""));
    if (game.phase === "cards" && this.alive().every((p) => game.ready.includes(p) || !this.isConnected(p)))
      this.beginRound();
    this.maybeCloseVote();
  }

  protected participantLeft(id: string) {
    const game = this.state.game;
    // A new host may have been chosen; let them moderate if they're not playing.
    const host = this.clientOf(this.state.hostId);
    if (host) this.showSecrets(host, this.state.hostId);
    if (this.acceptsNewPlayers() || !this.alive().includes(id)) return;
    // Departure: ousted without a Vote, role stays hidden until the end.
    game.out.push(id);
    this.votes.delete(id);
    if (this.checkWin()) return;
    if (game.phase === "describe" && game.order[game.turn] === id) {
      this.endTurnSilently();
    } else if (game.phase === "vote") {
      if (game.candidates.includes(id)) {
        const rest = [...game.candidates].filter((c) => c !== id);
        for (const [voter, target] of this.votes)
          if (target === id) {
            this.votes.delete(voter);
            const b = game.ballots.get(voter);
            if (b) Object.assign(b, { cast: false, target: "" });
          }
        game.candidates.clear();
        game.candidates.push(...rest);
      }
      this.maybeCloseVote();
    } else if (game.phase === "guess" && game.guessBy === id) {
      this.resolveGuess("");
    } else if (game.phase === "cards") {
      if (this.alive().every((p) => game.ready.includes(p) || !this.isConnected(p)))
        this.beginRound();
    }
  }

  /** Moves past a departed speaker without logging a clue for them. */
  private endTurnSilently() {
    const game = this.state.game;
    do game.turn++;
    while (game.turn < game.order.length && game.out.includes(game.order[game.turn]));
    if (game.turn < game.order.length) return this.startTurn();
    game.phase = "discuss";
    this.schedule(game.settings.discussionSeconds * this.secondMs, () =>
      this.openVote(false, []),
    );
  }
}
