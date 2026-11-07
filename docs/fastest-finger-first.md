# Fastest Finger First design

Agreed game design, implemented in `src/games/fastest-finger-first/`. See [the pack guide](../packs/README.md) for file format and deployment configuration. Game terminology and rules are recorded in [CONTEXT.md](../CONTEXT.md#fastest-finger-first).

## Question packs and media

Packs live outside the application image in a persistent NAS directory, mounted read-only into the container at `/app/packs`. App updates do not replace packs, and adding content does not require rebuilding the image.

Example host layout:

```text
/mnt/user/appdata/party-games/packs/
└── diwali-2026/
    ├── questions.yaml
    └── media/
        ├── picture.jpg
        ├── song.mp3
        └── movie.mp4
```

Each pack can mix text, image, audio, and video questions. Question files include private correct answers and are read by the server; the TV receives public content and the host receives private answers. The server serves the media needed by the TV.

New games load the latest pack files. Active games retain the pack version they started with, including their referenced media, so editing a pack does not change a running game. Media is streamed into content-addressed copies under `DATA_DIR/fff-media`, served through a media-only route with byte-range support. Question manifests have no public HTTP route.

Questions follow the pack's prepared order by default. The host can skip or select another question.

## Screens and controls

- Host: a private, non-playing role with the question, prepared answer, player verdicts, and all game controls. Players answer aloud; the host marks Correct or Wrong without transcribing answers.
- TV: an optional public display for question content, media, game status, and results. Losing its connection does not automatically pause play.
- Player: buzzer, score, buzzing status, selected answering player, and lockout status. Question content stays off player phones. The buzzer is red when available, green for the first eligible player to buzz, and grey and disabled for others while that player answers.

Host actions synchronize the TV and player screens in real time.

## Question flow

1. Start question selects the current question and presents its public content; buzzers are not yet open.
2. Open buzzers begins the race. An early buzz locks that player out for the entire question without deducting points.
3. The first eligible buzz selects the answering player, hides the TV hint, stops audio/video, and disables other buzzers. There is no queue carried into another attempt.
4. The host judges the spoken answer. A wrong answer carries a point penalty and locks the player out for the rest of that question.
5. The host can reopen the question or move on. Reopening restores the hint and restarts audio/video from the beginning; buzzers stay closed until Open buzzers. All existing early-buzz and wrong-answer lockouts persist.
6. Reveal answer is a separate host action that publicly shows the prepared answer and permanently closes the question to further buzzing. Judging an answer does not reveal it.

Undo last verdict reverses the latest verdict and its points on the current question, restores that player's eligibility, and leaves buzzers closed until the host continues. Manual score adjustments remain intact.

## Scoring

Correct answers default to +10 points and wrong answers to −5; totals may fall below zero. The host can change reward and penalty values per question during play. Changes recalculate every judged attempt on the current question; completed questions remain unchanged.

More options lets the host edit any player's total score. The difference is retained as a separate adjustment so recalculating question points preserves the correction.

## Participation and interruptions

New arrivals wait until the next question. Reconnecting players retain their scores and question lockouts.

The host can manually pause and resume play. Pausing closes buzzers and stops media while preserving the question, selected answering player, lockouts, and scores. Host disconnection automatically pauses play; players do not acquire host controls or private answers. The host controls continuation after reconnecting.

## Ending and results

End game requires confirmation and can finish the game with questions remaining. The host controls Previous/Next through the following slides, with no automatic advancing:

1. Final standings for every player, including total scores. Equal scores share ranks, such as 1st, 1st, 3rd.
2. Answer stats for every player: correct answers, wrong answers, and accuracy.
3. Buzzer stats for every player: buzzes won and early-buzz lockouts.
4. One spotlight per player with their full breakdown, including manual score adjustments.

Starting another game in the same room keeps everyone connected, lets the host select a pack, and resets scores and stats. Completed results remain saved.

Players with no judged answers show an em dash for accuracy. Otherwise, accuracy is correct answers divided by correct plus wrong answers; early buzzes and undone verdicts are excluded. A buzz win is still counted if its verdict is later undone.
