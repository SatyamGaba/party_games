# Indian American media test pack

20 family-friendly questions: 8 text, 4 images, 4 audio clues, and 4 video clues. The first four questions exercise all four types immediately. Topics mix Indian food, festivals, films, cricket, and US culture. Answers include reasonable spoken variants for the host.

All media is included locally. Images are original schematic illustrations; audio uses an original spoken clue read by macOS Samantha; videos are original timed clue cards, with narration on three and a deliberately silent Holi round. These are playback fixtures, not Bollywood film clips or song recordings. No downloads or external URLs are required during play.

PNG images, stereo MP3 audio, and H.264/yuv420p MP4 video (AAC where audible) cover common TV browser formats. Selected clips exercise zero/nonzero starts, explicit ends, and full-file playback. The warmup has no wrong-answer penalty; harder questions exercise custom scoring.

## Host check

Select **Indian American Test Pack - All Media** after **Refresh packs**, then start a new game. Existing games keep their original pack snapshot.

- Check the first text question appears on TV while the prepared answer stays private.
- Check the flag image loads clearly.
- Enable playback on the TV if prompted, then check the chai audio is audible.
- Check video clue cards appear progressively and narration plays.
- Buzz during audio/video: playback should stop. Mark wrong, reopen, and verify the clip restarts at its configured start while that player stays locked out.
- Pause/resume, reveal the answer, and check the silent Holi video remains silent.

Default scoring is +10 / -5 unless explicitly set in questions.yaml. The repeated Holi answer is intentional for comparison between a text question and silent video.

## NAS installation

Saved at `/mnt/user/appdata/party-games/data/packs/indian-american-test`. The current running container uses `/app/packs -> /app/data/packs`. Before replacing the container, set `PACKS_DIR=/app/data/packs` in its deployment configuration, or bind mount the NAS data/packs directory read-only at `/app/packs`. The data files persist, but the temporary container symlink does not survive container replacement. No application restart was performed.
