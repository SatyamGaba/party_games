import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Button, Notice } from "../../components/ui";
import type { QuestionKind } from "./shared";

export function QuestionMedia({
  type,
  url,
  start,
  end,
}: {
  type: QuestionKind;
  url: string;
  start: number;
  end: number;
}) {
  const element = useRef<HTMLMediaElement | null>(null);
  const [blocked, setBlocked] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    const media = element.current;
    return () => {
      if (!media) return;
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [url]);
  if (!url || type === "text") return null;
  if (error)
    return (
      <Notice>
        Media could not load. Let the host know; they can pause or skip this
        question.
      </Notice>
    );
  if (type === "image")
    return (
      <img
        className="fff-image"
        src={url}
        alt="Question clue"
        onError={() => setError(true)}
      />
    );
  function ready(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    if (Number.isFinite(media.duration) && start >= media.duration) {
      setError(true);
      return;
    }
    media.currentTime = start;
    void media.play().catch(() => setBlocked(true));
  }
  function clip(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    if (end && media.currentTime >= end && !media.paused) {
      media.pause();
      media.currentTime = end;
    }
  }
  const props = {
    ref: (node: HTMLMediaElement | null) => { element.current = node; },
    src: url,
    onLoadedMetadata: ready,
    onTimeUpdate: clip,
    onError: () => setError(true),
    preload: "auto",
  } as const;
  return (
    <div className="fff-media">
      {type === "video" ? (
        <video className="fff-video" playsInline {...props} />
      ) : (
        <>
          <div className="fff-audio-art" aria-hidden="true">
            ♫
          </div>
          <audio {...props} />
        </>
      )}
      {blocked && (
        <Button
          variant="primary"
          onClick={() => {
            void element.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true));
          }}
        >
          Enable playback on this screen
        </Button>
      )}
      <p className="fff-caption">
        {type === "audio" ? "Listen closely." : "Watch closely."}
      </p>
    </div>
  );
}
