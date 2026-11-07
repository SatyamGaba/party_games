import { useCallback, useEffect, useRef, useState } from "react";

/** A short, gentle chime generated locally; no media download latency. */
export function useBuzzerSound(ticking = false) {
  const context = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enable = useCallback(() => {
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      void audio.resume().then(() => setEnabled(audio.state === "running")).catch(() => setEnabled(false));
    } catch { setEnabled(false); }
  }, []);
  const play = useCallback(() => {
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      // Resume synchronously from the phone's tap to satisfy mobile autoplay rules.
      void audio.resume().then(() => {
        if (audio.state !== "running") { setEnabled(false); return; }
        setEnabled(true);
        const now = audio.currentTime;
        // Two soft, ascending notes make the buzz recognizable without a harsh edge.
        for (const [frequency, offset] of [[523.25, 0], [659.25, 0.1]]) {
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          tone.type = "sine";
          tone.frequency.setValueAtTime(frequency, now + offset);
          gain.gain.setValueAtTime(0, now + offset);
          gain.gain.linearRampToValueAtTime(0.22, now + offset + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.24);
          tone.connect(gain).connect(audio.destination);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
          tone.start(now + offset);
          tone.stop(now + offset + 0.25);
        }
      }).catch(() => setEnabled(false));
    } catch { setEnabled(false); }
  }, []);
  useEffect(() => {
    if (!ticking || !enabled) return;
    const audio = context.current;
    if (!audio) return;
    let activeTone: OscillatorNode | null = null;
    function tick() {
      if (!audio || audio.state !== "running") return;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(1400, audio.currentTime);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.28, audio.currentTime + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.06);
      tone.connect(gain).connect(audio.destination);
      activeTone = tone;
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
        if (activeTone === tone) activeTone = null;
      };
      tone.start();
      tone.stop(audio.currentTime + 0.07);
    }
    tick();
    const timer = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(timer);
      activeTone?.stop();
    };
  }, [ticking, enabled]);
  useEffect(() => () => { void context.current?.close().catch(() => undefined); context.current = null; }, []);
  return { enable, enabled, play };
}
