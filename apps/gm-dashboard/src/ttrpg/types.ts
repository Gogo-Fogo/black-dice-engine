// Host view compatibility exports; definitions live in the shared browser-safe package.
export type {
  RuntimeStatus, TableEventRecord, MemoryEntry, CampaignFact, CampaignBible, CampaignLocation,
  CampaignNpc, ActiveSceneContext, LocalModelAdapterDraft, DirectorModeAdapterDraft, AiLogEntry,
  ErrorEvent, MediaJob, AudioTrack, PlaybackState, AssetRecord, CleanupPolicy, CleanupCandidate,
  CleanupReport, StateEventProposal, ScenePacket, ScenePacketValidation, SessionSnapshot, StateEventDraft,
  StateEventCommand as StateEventRequest, HostSocketEnvelope as SocketEnvelope
} from "../../../../packages/contracts/dist/index.js";
