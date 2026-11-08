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
    const now = audio.currentTime;
    if (correct) {
      // Many short, scattered noise bursts create the texture of a crowd clapping.
      const duration = 2.6;
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let clap = 0; clap < 160; clap++) {
        const start = Math.floor(Math.random() * (duration - 0.1) * audio.sampleRate);
        const length = Math.floor((0.035 + Math.random() * 0.055) * audio.sampleRate);
        const strength = 0.12 + Math.random() * 0.13;
        for (let i = 0; i < length && start + i < samples.length; i++) {
          samples[start + i] += (Math.random() * 2 - 1) * strength * Math.exp(-i / (length * 0.22));
        }
      }
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.6;
      gain.gain.setValueAtTime(1.5, now);
      gain.gain.setValueAtTime(1.5, now + 1.8);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.connect(filter).connect(gain).connect(audio.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(now);
    } else {
      // Layer slightly different voices through a vowel-shaped filter for a crowd boo.
      const duration = 1.8;
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(650, now);
      filter.Q.value = 3;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.18);
      gain.gain.setValueAtTime(0.3, now + 1.25);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      filter.connect(gain).connect(audio.destination);
      let remaining = 5;
      [130, 146, 162, 177, 195].forEach((frequency, index) => {
        const voice = audio.createOscillator();
        const voiceGain = audio.createGain();
        voice.type = "sawtooth";
        voice.frequency.setValueAtTime(frequency, now);
        voice.frequency.linearRampToValueAtTime(frequency * 0.85, now + duration);
        voiceGain.gain.value = 0.16;
        voice.connect(voiceGain).connect(filter);
        voice.onended = () => {
          voice.disconnect();
          voiceGain.disconnect();
          if (--remaining === 0) { filter.disconnect(); gain.disconnect(); }
        };
        voice.start(now + index * 0.025);
        voice.stop(now + duration);
      });
    }
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
      tone.type = "triangle";
      tickHigh = !tickHigh;
      tone.frequency.setValueAtTime(tickHigh ? 900 : 700, audio.currentTime);
      tone.frequency.exponentialRampToValueAtTime(tickHigh ? 430 : 320, audio.currentTime + 0.07);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, audio.currentTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
      tone.connect(gain).connect(audio.destination);
      activeTone = tone;
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
        if (activeTone === tone) activeTone = null;
      };
      tone.start();
      tone.stop(audio.currentTime + 0.13);
    }
    tick();
    const timer = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(timer);
      activeTone?.stop();
    };
  }, [ticking, enabled]);
  useEffect(() => () => { void context.current?.close().catch(() => undefined); context.current = null; }, []);
  return { enable, enabled, play, playVerdict };
}
