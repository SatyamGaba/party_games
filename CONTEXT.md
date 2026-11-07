# HouseParty

A self-hosted party-game platform. Players join on phones; a shared screen can host.

## Language

**Undercover**:
A social deduction word game for 3 to 20 players. Players get secret words, describe them, and vote out Infiltrators.

**Word pair**:
Two related words chosen for one game. Civilians get one, the Undercover gets the other.

**Civilian**:
A player holding the Civilian word. Civilians are the majority and win by ousting every Infiltrator.

**Infiltrator**:
Either an Undercover or a Mr. White. Infiltrators win by surviving until one Civilian remains.

**Undercover**:
An Infiltrator holding the other word of the pair. Does not know they differ.

**Mr. White**:
An Infiltrator with no word. Must bluff. If ousted, gets one guess at the Civilian word; a correct guess wins immediately.

**Roster**:
The players dealt into a game when the host starts it. Fixed for that game; anyone joining later waits for the next game.

**Word card**:
What each player privately sees at game start: their word only. Civilians and Undercover are not told which they are; only Mr. White is told their role. Description begins once everyone is ready, or after a short fallback.

**Description**:
The phase where each remaining player in turn gives a word or phrase hinting at their word.

**Clue**:
What a player says about their word during Description. Delivered either spoken aloud or typed in the app, as chosen by the host (**Clue mode**). A typed Clue is a short word or phrase and must not contain the player's own word. Typed Clues are shown to everyone in a **Clue log**. If the Turn timer runs out, the turn passes with no Clue; in spoken mode the speaker can also end their turn early.

**Clue mode**:
Host setting at game start: **spoken** (app only tracks turns) or **typed** (clues submitted in the app and shown to all).

**Turn timer**:
Host setting at game start: how long each player has to give their clue.

**Speaking order**:
Each round starts with a random first speaker who is never Mr. White, then proceeds clockwise by seat. Description ends once every remaining player has had a turn.

**Discussion**:
The phase where players debate who the Infiltrators are. Runs on a host-chosen **Discussion timer** (or no limit); the host can open the Vote early.

**Vote**:
Every remaining player picks one person to oust. Most votes is out. Votes are secret and changeable until the Vote closes; nobody may vote for themselves. The Vote closes once every remaining player has voted or abstained, or when the host closes it. On close, the tally and who voted for whom are shown to everyone.

**Ousted**:
Removed from the game by a vote. Ousted players cannot vote.

**Role reveal**:
When a player is Ousted by a Vote, everyone sees their role (Civilian, Undercover or Mr. White) but not their word. Words are revealed only when the game ends. An ousted Mr. White still gets their one guess before play continues.

**Scoreboard**:
Running points per player across the games played in one room. A winning Civilian scores 2, a winning Mr. White 6, a winning Undercover 10. The host can start another game in the same room with fresh roles and a new Word pair.

**Winning side**:
Civilians win by ousting every Infiltrator. Infiltrators win by surviving until one Civilian remains: each surviving Infiltrator role scores its own points. If Mr. White guesses the Civilian word correctly, only Mr. White wins and scores.

**Mr. White guess**:
One attempt, no hints. It counts as correct when it matches the Civilian word ignoring case, accents, spacing, punctuation and a simple plural ending.

**Tie-break vote**:
When a Vote ties, only the tied players are voted on again. If it ties again, nobody is ousted that round and play continues to the next Description.

**Role split**:
How many Undercover and Mr. White players a game has. Defaults from player count, and the host can override it or randomize it. There is always at least one Infiltrator, and Civilians always outnumber Infiltrators. Mr. White is optional.

**Host**:
The participant who starts the game and chooses its settings. For now the host does not play: they get no word and no vote.

**Abstention**:
A Vote cast by nobody. A disconnected player abstains and never blocks the Vote or the turn order; their turn is skipped when the Turn timer runs out. They keep their seat, word and role if they rejoin.

**Departure**:
A player leaving the room for good is Ousted without a Vote. Their role stays hidden until the game ends. If this ends the game, the game ends immediately.

**Moderator view**:
Host setting at game start: whether the host sees every player's word and role (**Reveal roles**) or sees only settings, progress and controls (**Hide roles**). The host is always a person on a phone; the Shared screen is display-only and never shows secrets.

**Built-in pairs**:
The curated Word pairs shipped with the game, grouped by category. They are the only source of words: hosts cannot add their own. The host can limit play to chosen categories. A pair is not repeated within a room until every pair in the chosen categories has been used.

**Side assignment**:
Which word of a pair goes to Civilians and which to the Undercover is chosen at random each game.

**Shared screen**:
A non-player display (e.g. a TV) that shows public game state and stats: room code, settings, phase and timer, whose turn it is, the Clue log, who remains and who was Ousted (with Role reveal), how many have voted, the tally once a Vote closes, and the final reveal and Scoreboard. It never shows any player's word or unrevealed role.

## Flagged ambiguities

- Rules source does not define special roles; to be decided.
