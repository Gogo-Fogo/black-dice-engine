import { useEffect, useRef, useState } from "react";
import { createTrackSelection } from "./youtube-selection";

export function useYoutubeMusic() {
  const [ytUrl, setYtUrl] = useState("");
  const [ytVideoId, setYtVideoId] = useState("");
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytLoop, setYtLoop] = useState(true);
  const [ytVolume, setYtVolume] = useState(30);
  const [ytTracks, setYtTracks] = useState<Array<{ url: string; id: string; label: string }>>([]);
  const [ytFading, setYtFading] = useState(false);
  const selection = useRef<ReturnType<typeof createTrackSelection> | null>(null);
  if (!selection.current) selection.current = createTrackSelection();
  useEffect(() => () => selection.current?.cancel(), []);

  function selectTrack(id: string) {
    // Selecting the current track also cancels an older, still pending switch.
    selection.current!.cancel();
    setYtFading(false);
    if (id === ytVideoId) return;
    setYtFading(true);
    selection.current!.select(id, nextId => {
      setYtVideoId(nextId);
      setYtPlaying(true);
      setYtFading(false);
    });
  }
  function stopTrack() {
    selection.current!.cancel();
    setYtFading(false);
    setYtPlaying(!ytPlaying);
    setYtVideoId(ytPlaying ? "" : ytVideoId);
  }
  function clearTracks() {
    selection.current!.cancel();
    setYtFading(false);
    setYtTracks([]);
  }
  return { ytUrl, setYtUrl, ytVideoId, ytPlaying, ytLoop, setYtLoop, ytVolume, setYtVolume, ytTracks, setYtTracks, ytFading, selectTrack, stopTrack, clearTracks };
}
