import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { startAmbient, stopAmbient } from "../ambient";
import { isHostCancellation, type HostRequests } from "./host-requests";
import { createMarkdownDownloads } from "./markdown-download";
import type { SessionSnapshot } from "./types";

export function useHostControls(api: HostRequests, snapshot: SessionSnapshot | null, setSnapshot: (value: SessionSnapshot) => void) {
  const [advancedMode, setAdvancedMode] = useState(() => {
    try { return window.localStorage.getItem("bde-gm-advanced") === "true"; } catch { return false; }
  });
  const toggleAdvancedMode = useCallback(() => setAdvancedMode(previous => {
    const next = !previous;
    try { window.localStorage.setItem("bde-gm-advanced", String(next)); } catch { /* Session preference still works. */ }
    return next;
  }), []);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [sceneStatus, setSceneStatus] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [autoSearch, setAutoSearch] = useState(true);
  const sceneBusy = useRef(false), saveBusy = useRef(false), exportBusy = useRef(false);
  const [downloads] = useState(() => createMarkdownDownloads({
    createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url),
    dispatch(url, filename) {
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
    }
  }));
  useEffect(() => () => { downloads.dispose(); stopAmbient(); }, [downloads]);
  useEffect(() => {
    let mounted = true;
    setQrCodeUrl("");
    if (snapshot?.joinUrl) void QRCode.toDataURL(snapshot.joinUrl, {
      margin: 1, width: 220, color: { dark: "#f6e8c8", light: "#0d0b09" }
    }).then(url => { if (mounted) setQrCodeUrl(url); }).catch(() => { /* Join URL remains readable. */ });
    return () => { mounted = false; };
  }, [snapshot?.joinUrl]);
  async function exportSessionSummary() {
    if (exportBusy.current) return;
    exportBusy.current = true; setExportStatus("exporting"); setExportPath("");
    try {
      const result = await api.summary();
      downloads.download(result.blob, result.filename); setExportPath(result.exportPath); setExportStatus("ready");
    } catch (error) { if (!isHostCancellation(error)) setExportStatus("failed"); }
    finally { exportBusy.current = false; }
  }
  async function saveNow() {
    if (saveBusy.current) return;
    saveBusy.current = true; setSaveStatus("saving");
    try { setSnapshot(await api.save()); setSaveStatus("saved"); }
    catch (error) { if (!isHostCancellation(error)) setSaveStatus("failed"); }
    finally { saveBusy.current = false; }
  }
  async function changeScene() {
    const title = sceneTitle.trim();
    if (!title || sceneBusy.current) return;
    sceneBusy.current = true; setSceneStatus("saving");
    try {
      setSnapshot(await api.scene(title)); setSceneTitle(current => current.trim() === title ? "" : current); setSceneStatus("ready");
      // Optional presentation failure must not turn a confirmed scene change into a command failure.
      try {
        startAmbient(title);
        if (autoSearch) window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(`DnD ambience ${title} 1 hour`)}`, "_blank", "noopener,noreferrer");
      } catch { /* Silence and a blocked popup do not undo the confirmed command. */ }
    } catch (error) { if (!isHostCancellation(error)) setSceneStatus("failed"); }
    finally { sceneBusy.current = false; }
  }
  return { advancedMode, toggleAdvancedMode, qrCodeUrl, exportStatus, exportPath, exportSessionSummary,
    saveStatus, saveNow, sceneStatus, sceneTitle, setSceneTitle, changeScene, autoSearch, setAutoSearch };
}
