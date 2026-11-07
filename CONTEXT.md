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

## Fastest Finger First

**Final standings**:
Players ranked by total score, including Manual score edits. Equal scores share a rank using competition ranking, such as 1st, 1st, 3rd.

**New game**:
The Host starts fresh play in the same room, keeping participants connected and selecting a pack while resetting scores and stats. The completed game's results remain saved.

**Answer stats**:
Each player's counts of correct and wrong answers and their answer accuracy.

**Buzzer stats**:
Each player's counts of buzzes won and early-buzz lockouts.

**Player spotlight**:
A results slide dedicated to one player's full breakdown, including Manual score edits.

**End game**:
A Host action, confirmed before ending, that finishes play even when questions remain and opens the Results slideshow.

**Results slideshow**:
Final standings, per-player Answer stats, per-player Buzzer stats, and one Player spotlight per player, shown after End game. The Host controls slides with Previous/Next; slides never advance automatically.

**Optional TV**:
The Shared screen is optional for Fastest Finger First; the Host can run play without it. Losing the TV connection does not automatically pause play.

**Manual pause**:
A Host action that suspends play, closes buzzers, and stops media while preserving the Current question, selected answering player, lockouts, and scores. The Host controls when play resumes.

**Host disconnection**:
Play pauses when the Host disconnects: buzzers close and media stops, while the Current question and scores are preserved. Players do not gain Host controls or access to private answers while the Host is offline.

**Late arrival**:
A new player who joins during a question waits until the next question to participate. A reconnecting player retains their existing score and question lockout status.

**Player screen**:
A player's view of their Buzzer and game status, including score, buzzer availability, who won the buzz, and lockout status. Question text, pictures, audio, and video appear on the Shared screen rather than player phones.

**Undo last verdict**:
A Host action that reverses the latest Correct or Wrong verdict on the Current question, reverses its points, and restores that player's eligibility. Buzzers stay closed until the Host continues, and Manual score edits remain intact.

**Reveal answer**:
A separate Host action that shows the prepared correct answer on the Shared screen and permanently closes that question to further buzzing. Marking an answer Correct or Wrong does not reveal the prepared answer.

**Current question**:
The question selected by the Host through Start question, with its public content presented on the Shared screen. Starting a question does not open buzzing.

**Open buzzers**:
A separate Host action that opens the buzzer race for the Current question.

**Early buzz**:
A buzz on the Current question before the Host opens buzzers. The player is locked out for the rest of that question without losing points.

**Question pack**:
A named, preconfigured collection of text, image, audio, and video questions with private correct answers for an event or theme, such as diwali-2026. The Host selects prepared questions in pack order or chooses another; new games use the latest pack version while an active game retains its starting version.

**Manual score edit**:
A Host-only change to an individual player's total score, available through More options during play. The difference is retained as a separate adjustment when question points are recalculated.

**Question scoring**:
The points awarded for a correct answer and deducted for a wrong answer on a question, defaulting to +10 and −5 respectively; scores may fall below zero. The Host can override these amounts for individual questions during play; changes to the current question recalculate all its judged attempts, while completed questions stay unchanged.

**Wrong-answer lockout**:
A player who answers incorrectly cannot buzz again for the rest of that question, including when the Host reopens it. This exclusion applies alongside the question's point penalty.

**Reopen question**:
The Host offers the same question again, restoring its TV hint and restarting any audio or video from the beginning; buzzers remain closed until the Host opens them again. Earlier buzz order does not carry over, and players locked out by an early buzz or wrong answer remain excluded; the Host chooses whether to reopen or move to the next question.

**Host control**:
The Host determines question progress, including starting, judging answers, reopening, and moving to the next question. The TV and player screens follow the Host's current question state in real time.

**Host screen**:
The non-playing Host's private view of the question, prepared correct answer, and players' verdicts. The Host reads questions aloud, starts each question, marks spoken answers Correct or Wrong without transcribing them, and controls question progress.

**TV hint**:
The public question content shown on the Shared screen when the Host starts a question. A buzz hides the TV hint and stops any accompanying audio or video while a player answers.

**Fastest Finger First**:
A buzzer game where players compete to answer prompts on the Shared screen. Players answer aloud, and a non-playing Host judges answers as correct or incorrect.

**Buzzer**:
The big red button on each player's phone used to claim the opportunity to answer aloud. The first eligible player to buzz sees their button turn green to indicate their turn to answer; other players' buttons turn grey and are disabled while that player answers.

## Flagged ambiguities

- Rules source does not define special roles; to be decided.
