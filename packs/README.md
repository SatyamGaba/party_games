# Question packs

Each directory is one reusable pack. The folder name is its ID: lowercase letters, digits, underscores, and hyphens, up to 80 characters. For example:

```text
packs/
└── diwali-2026/
    ├── questions.yaml
    └── media/
        ├── rangoli.jpg
        ├── song.mp3
        └── scene.mp4
```

Edit these files before hosting; there is no in-app question editor. The included `diwali-2026` pack contains four playable text questions. Add your own media files and questions to extend it.

## File format

`questions.yaml` contains a title and an ordered question list. Question IDs must be unique within a pack. Quote answers that YAML could interpret as numbers or booleans, such as `"20"` or `"yes"`.

The following example demonstrates every question type; create the referenced media files before using it:

```yaml
title: Diwali 2026
questions:
  - id: warmup
    type: text
    prompt: What is Diwali commonly known as the festival of?
    text: Diwali is the festival of…?
    answer: Lights
    reward: 10
    penalty: 5

  - id: picture
    type: image
    prompt: What is this decorative floor art called?
    text: Name this art form.
    media: media/rangoli.jpg
    answer: Rangoli

  - id: song
    type: audio
    prompt: Name this song.
    media: media/song.mp3
    start: 15
    end: 30
    answer: Replace with the song title
    reward: 20
    penalty: 10

  - id: movie
    type: video
    prompt: Which movie is this clip from?
    media: media/scene.mp4
    start: 5
    end: 18
    answer: Replace with the movie title
```

- `prompt` and `answer` are required. The host privately sees both, including a preview before starting a question. Answers are only made public through Reveal answer.
- `type` defaults to `text`. For text questions, omitting `text` displays `prompt` on the TV; an explicit `text: ""` leaves the TV text blank. Other types default to no TV text.
- `media` is required for image, audio, and video questions. Paths are relative to the pack folder and must stay inside it; remote URLs and paths or symlinks escaping the folder are rejected.
- `start` defaults to zero; optional `end` must be greater than `start`. Both are seconds. Reopening restarts the selected clip at `start`.
- `reward` and `penalty` default to 10 and 5. Both are nonnegative integers up to 10,000. A penalty is the amount deducted, so write `5`, not `-5`.
- Supported images: JPEG, PNG, WebP, GIF, AVIF. Audio: MP3, WAV, OGG, M4A, FLAC, WebM. Video: MP4, WebM, OGV. Actual playback depends on the TV browser; MP3 and H.264/AAC MP4 are practical choices for broad support.
- Each pack supports up to 250 questions, a 1 MB question file, and media files up to 200 MB each. The pack picker reports invalid packs so you can correct them and refresh.

When a browser blocks audio/video autoplay, the TV shows an Enable playback button. Tap it on the TV before continuing. Browsers may need this interaction again after a clip is replaced or restarted.

## Storage and updates

Development reads `./packs` by default. Set `PACKS_DIR` to use another directory.

Docker reads `/app/packs` from a read-only bind mount. Set `PARTY_PACKS_DIR` for Compose to point at a host folder; the default is `./packs`. On Unraid, use `/mnt/user/appdata/party-games/packs`, readable by container UID/GID 1000. Copy the starter pack there if desired. The image excludes packs and their media.

The host can Refresh packs before loading a game. Each new game reads the latest pack files. Question data stays in that game's room, and media is streamed into immutable, content-addressed copies under `DATA_DIR/fff-media`. Consequently, editing or deleting source media cannot change an already loaded game. These cached copies remain across games and application updates; include them with data backups. They are not automatically pruned.

Media is served through the app's existing origin, including byte-range requests for seeking. Question manifests have no public HTTP endpoint. Keep the entire packs folder in your normal NAS backup process.
