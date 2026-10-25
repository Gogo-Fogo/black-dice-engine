import { useEffect, useRef, useState } from "react";
import type { HostRequests } from "./host-requests";
import { createNarrationPlayback } from "./narration-playback";

export function useNarration(api: HostRequests, sceneKey: string, fallbackText: string) {
  const [speaking, setSpeaking] = useState(false), [narrationText, setNarrationText] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [playback] = useState(() => createNarrationPlayback());
  const epoch = useRef(0), mounted = useRef(false), busy = useRef(false), polling = useRef(false);
  const lastText = useRef(""), fallback = useRef(fallbackText);
  fallback.current = fallbackText;
  async function unlockAudio() {
    const current = epoch.current;
    const unlocked = await playback.unlock();
    if (mounted.current && current === epoch.current) setAudioUnlocked(unlocked);
  }
  async function speakSceneText(override?: string) {
    if (!mounted.current || busy.current) return;
    busy.current = true; setSpeaking(true);
    const current = epoch.current;
    let started = false;
    try {
      let text = override;
      if (!text) {
        try { const data = await api.pendingNarration(); if (typeof data?.text === "string") text = data.text; }
        catch { /* Prepared memory text remains usable. */ }
      }
      text ||= fallback.current;
      if (!mounted.current || current !== epoch.current || !text) return;
      lastText.current = text; setNarrationText(text);
      const blob = await api.speech(text.length > 500 ? text.slice(0, 500) + "..." : text);
      if (!mounted.current || current !== epoch.current) return;
      started = await playback.play(blob, () => {
        if (mounted.current && current === epoch.current) { busy.current = false; setSpeaking(false); }
      });
    } catch { /* Keep readable text when optional speech fails or autoplay is refused. */ }
    finally {
      if (mounted.current && current === epoch.current && !started) { busy.current = false; setSpeaking(false); }
    }
  }
  useEffect(() => {
    setAudioUnlocked(false);
    return () => playback.dispose();
  }, [playback]);
  useEffect(() => {
    mounted.current = true; epoch.current += 1; busy.current = false; polling.current = false;
    lastText.current = ""; setSpeaking(false); setNarrationText("");
    setNarrationText(fallback.current);
    const interval = setInterval(async () => {
      if (busy.current || polling.current) return;
      polling.current = true;
      const current = epoch.current;
      try {
        const data = await api.pendingNarration();
        if (mounted.current && current === epoch.current && !busy.current && typeof data?.text === "string" && data.text && data.text !== lastText.current) {
          lastText.current=data.text; setNarrationText(data.text);
        }
      } catch { /* Retry the read on a later poll, without submitting speech. */ }
      finally { if (current === epoch.current) polling.current = false; }
    }, 3000);
    return () => {
      mounted.current = false; epoch.current += 1;
      clearInterval(interval); playback.stop();
    };
  }, [api, playback, sceneKey]);
  return { speaking, narrationText, audioUnlocked, unlockAudio, speakSceneText };
}
