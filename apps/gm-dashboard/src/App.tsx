import { CampaignProgressPanel } from "./ttrpg/CampaignProgressPanel";
import { RollCallPanel } from "./ttrpg/RollCallPanel";
import React, {useState} from "react";
import {StagePreview} from "./StageApp";
import "./stage.css";
import {CharacterArtwork} from '../../character-artwork';
import { useNarration } from "./ttrpg/useNarration";
import { NarrationPanel } from "./ttrpg/NarrationPanel";
import { useHostSession } from "./ttrpg/useHostSession";
import { useHostControls } from "./ttrpg/useHostControls";
import { HostControls } from "./ttrpg/HostControls";
import { CleanupPanel, MemoryPanel } from "./ttrpg/ReportPanels";
import { useAudioLibrary } from "./ttrpg/useAudioLibrary";
import { AudioLibraryPanel, AudioCuePanel } from "./ttrpg/AudioPanels";
import { useMediaJobs } from "./ttrpg/useMediaJobs";
import { MediaJobQueuePanel, GeneratedMediaPanel } from "./ttrpg/MediaPanels";
import { useGallery } from "./ttrpg/useGallery";
import { LatestScenePanel, GalleryPanel, GalleryPreview } from "./ttrpg/GalleryPanels";
import { useYoutubeMusic } from "./ttrpg/useYoutubeMusic";
import { YoutubeMusicPanel } from "./ttrpg/YoutubeMusicPanel";
import { useSceneDrafts } from "./ttrpg/useSceneDrafts";
import { useAiDirector } from "./ttrpg/useAiDirector";
import { SceneDraftPanel, LocalModelPanel, DirectorDraftPanel, AiDirectorPanel } from "./ttrpg/AiPanels";
import { useCharacterCreation } from "./ttrpg/useCharacterCreation";
import { CharacterCreationPanel } from "./ttrpg/CharacterCreationPanel";
import { useTableControls } from "./ttrpg/useTableControls";
import { TableStatePanel, ApprovalPanel } from "./ttrpg/TablePanels";
import { DiceOverlay } from "./ttrpg/DiceOverlay";
import { RuntimePanel, PresencePanel, AiActivityPanel, ErrorLogPanel, RollLogPanel, EventHistoryPanel, CampaignContextPanel } from "./ttrpg/DiagnosticPanels";

export default function App() {
  const tabs=["stage","run","media","audio","system"] as const;
  const [tab,setTab]=useState<(typeof tabs)[number]>(()=>{try{const saved=localStorage.getItem("bde-gm-tab");return tabs.includes(saved as (typeof tabs)[number])?saved as (typeof tabs)[number]:"run";}catch{return "run";}});
  const { runtime, snapshot, setSnapshot, setRuntime, pendingActionKey, setPendingActionKey,
    reports, api, connectionLabel, connectionError, bootstrapError, diceAnimation, setDiceAnimation } = useHostSession();
  const hostControls = useHostControls(api, snapshot, setSnapshot);
  const { advancedMode } = hostControls;
  const { loadCleanupReport, aiLogs, errorEvents } = reports;
  const characterCreation = useCharacterCreation();
  const tableControls = useTableControls({ setSnapshot, setPendingActionKey });
  const gallery = useGallery();
  const youtubeMusic = useYoutubeMusic();
  const audioLibrary = useAudioLibrary(runtime);

  const mediaJobs = useMediaJobs({ setSnapshot, setRuntime, setPendingActionKey, loadCleanupReport });
  const { mediaQueueStatus, setMediaQueueStatus, queueCharacterVisualCanonJob } = mediaJobs;
  const sceneDrafts = useSceneDrafts({ setSnapshot, setPendingActionKey, setMediaQueueStatus, loadCleanupReport });
  const { scenePacket, setDirectorDraft } = sceneDrafts;
  const aiDirector = useAiDirector({ scenePacket, setDirectorDraft, setPendingActionKey });

  const narration = useNarration(api, `${snapshot?.campaignId ?? ""}:${snapshot?.currentScene ?? ""}`, snapshot?.memoryEntries?.[0]?.summary ?? "");
  return (
    <main className="dashboard-shell" onClick={() => void narration.unlockAudio()}>
      <HostControls controls={hostControls} snapshot={snapshot} narration={narration} connectionLabel={connectionLabel} connectionError={connectionError} bootstrapError={bootstrapError} />

      <nav className="gm-tabs" aria-label="Dashboard sections">{tabs.map(name=><button key={name} type="button" aria-current={tab===name?"page":undefined} onClick={()=>{setTab(name);try{localStorage.setItem("bde-gm-tab",name);}catch{/* In-memory preference. */}}}>{name[0].toUpperCase()+name.slice(1)}</button>)}</nav>
      {tab==="stage"&&<StagePreview/>}
      {!["stage","run"].includes(tab)&&!advancedMode&&<p>Enable Advanced mode to see all {tab} controls.</p>}
      <section className="dashboard-grid">
        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <RuntimePanel runtime={runtime} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="run"}><CampaignProgressPanel snapshot={snapshot} setSnapshot={setSnapshot} /></div>

        <div data-dashboard-tab hidden={tab!=="run"}><RollCallPanel snapshot={snapshot} /></div>
        <div data-dashboard-tab hidden={tab!=="run"}><AiDirectorPanel controller={aiDirector} pendingActionKey={pendingActionKey} /></div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <PresencePanel runtime={runtime} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <CampaignContextPanel snapshot={snapshot} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="run"}>{advancedMode ? <CharacterCreationPanel controller={characterCreation} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="media"}><LatestScenePanel gallery={gallery} scene={snapshot?.currentScene ?? ""} /></div>

        <div data-dashboard-tab hidden={tab!=="run"}><NarrationPanel narration={narration} /></div>

        <div data-dashboard-tab hidden={tab!=="media"}>{advancedMode ? <GalleryPanel gallery={gallery} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="media"}><GalleryPreview gallery={gallery} /></div>

        <div data-dashboard-tab hidden={tab!=="run"}><TableStatePanel snapshot={snapshot} advancedMode={advancedMode} pendingActionKey={pendingActionKey} table={tableControls} queueCharacterVisualCanonJob={queueCharacterVisualCanonJob} /></div>
        <div data-dashboard-tab hidden={tab!=="run"}><article className="panel"><h2>Character portraits</h2><p>Approve player submissions to share their portraits and lock a reference for generation.</p><div className="character-gallery">{snapshot?.party.map(character=><article key={character.id}><h3>{character.name}</h3><CharacterArtwork character={character} host disabled={pendingActionKey!==''}/></article>)}</div></article></div>

        <div data-dashboard-tab hidden={tab!=="run"}>{advancedMode ? <ApprovalPanel snapshot={snapshot} pendingActionKey={pendingActionKey} table={tableControls} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="media"}>{advancedMode ? <SceneDraftPanel controller={sceneDrafts} pendingActionKey={pendingActionKey} mediaQueueStatus={mediaQueueStatus} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="media"}>{advancedMode ? <MediaJobQueuePanel snapshot={snapshot} pendingActionKey={pendingActionKey} media={mediaJobs} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="audio"}>{advancedMode ? <AudioLibraryPanel audio={audioLibrary} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="audio"}>{advancedMode ? <AudioCuePanel audio={audioLibrary} snapshot={snapshot} pendingActionKey={pendingActionKey} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="audio"}>{advancedMode ? <YoutubeMusicPanel music={youtubeMusic} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="media"}><GeneratedMediaPanel snapshot={snapshot} media={mediaJobs} pendingActionKey={pendingActionKey} /></div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <CleanupPanel reports={reports} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="run"}>{advancedMode ? <MemoryPanel reports={reports} snapshot={snapshot} pendingActionKey={pendingActionKey} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <LocalModelPanel controller={sceneDrafts} pendingActionKey={pendingActionKey} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <DirectorDraftPanel controller={sceneDrafts} pendingActionKey={pendingActionKey} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <AiActivityPanel aiLogs={aiLogs} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <ErrorLogPanel errorEvents={errorEvents} /> : null}</div>

        <div data-dashboard-tab hidden={tab!=="run"}><RollLogPanel snapshot={snapshot} /></div>

        <div data-dashboard-tab hidden={tab!=="system"}>{advancedMode ? <EventHistoryPanel snapshot={snapshot} /> : null}</div>

        {diceAnimation ? (
          <DiceOverlay key={diceAnimation.id} roll={diceAnimation} onClose={() => setDiceAnimation(null)} />
        ) : null}
      </section>
    </main>
  );
}
