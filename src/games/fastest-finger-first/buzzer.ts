import { useCallback, useEffect, useRef, useState } from "react";

/** A short buzzer generated locally; no media download latency. */
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
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.type = "sawtooth";
        tone.frequency.setValueAtTime(120, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.38, now + 0.025);
        gain.gain.setValueAtTime(0.38, now + 0.65);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, now);
        tone.connect(filter).connect(gain).connect(audio.destination);
        tone.onended = () => { tone.disconnect(); filter.disconnect(); gain.disconnect(); };
        tone.start(now);
        tone.stop(now + 0.81);
      }).catch(() => setEnabled(false));
    } catch { setEnabled(false); }
  }, []);
  const playVerdict = useCallback((correct: boolean) => {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;
    const notes = correct ? [523.25, 659.25, 783.99] : [392, 329.63, 261.63];
    const now = audio.currentTime;
    notes.forEach((frequency, index) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + index * 0.13;
      tone.type = "sine";
      tone.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      tone.connect(gain).connect(audio.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(start);
      tone.stop(start + 0.25);
    });
  }, []);
  useEffect(() => {
    if (!ticking || !enabled) return;
    const audio = context.current;
    if (!audio) return;
    let activeTone: OscillatorNode | null = null;
    let tickHigh = false;
    function tick() {
      if (!audio || audio.state !== "running") return;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = "sine";
      tickHigh = !tickHigh;
      tone.frequency.setValueAtTime(tickHigh ? 720 : 580, audio.currentTime);
      tone.frequency.exponentialRampToValueAtTime(tickHigh ? 500 : 400, audio.currentTime + 0.045);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, audio.currentTime + 0.006);
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
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
      activeTone?.stop();
    };
  }, [ticking, enabled]);
  useEffect(() => () => { void context.current?.close().catch(() => undefined); context.current = null; }, []);
  return { enable, enabled, play, playVerdict };
}
