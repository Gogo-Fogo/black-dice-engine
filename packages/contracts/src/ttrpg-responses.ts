import { isObject } from "./index.js";
import { isSessionSnapshot, isMediaJob, isAssetRecord, isScenePacket, isLocalModelAdapterDraft,
  isDirectorModeAdapterDraft, isRuntimeStatus, isAudioTrack, isPlaybackState, isAudioCue } from "./index.js";
import type { SessionSnapshot, MediaJob, AssetRecord, ScenePacket, ScenePacketValidation,
  LocalModelAdapterDraft, DirectorModeAdapterDraft, AudioTrack, PlaybackState, AudioCue, RuntimeStatus } from "./index.js";

export type SnapshotResponse = { sessionSnapshot: SessionSnapshot };
export type MediaJobResponse = SnapshotResponse & { job: MediaJob; runtimeStatus?: RuntimeStatus };
export type AssetResponse = SnapshotResponse & { asset: AssetRecord };
export type ScenePacketResponse = { packet: ScenePacket; validation: ScenePacketValidation };
export type SceneQueueResponse = SnapshotResponse & { queuedCount: number; validation: ScenePacketValidation };
export type LocalDraftResponse = { draft: LocalModelAdapterDraft; validation: ScenePacketValidation };
export type DirectorDraftResponse = { draft: DirectorModeAdapterDraft; validation: ScenePacketValidation };
export type AudioLibraryResponse = { tracks: AudioTrack[] };
export type AudioPlaybackResponse = { playbackState: PlaybackState };
export type AudioCueResponse = { cue: AudioCue; matchedTrack: AudioTrack };

export function isSnapshotResponse(value: unknown): value is SnapshotResponse {
  return isObject(value) && isSessionSnapshot(value.sessionSnapshot);
}
export function isMediaJobResponse(value: unknown): value is MediaJobResponse {
  return isObject(value) && isSessionSnapshot(value.sessionSnapshot) && isMediaJob(value.job) &&
    (value.runtimeStatus === undefined || isRuntimeStatus(value.runtimeStatus));
}
export function isAssetResponse(value: unknown): value is AssetResponse {
  return isObject(value) && isSessionSnapshot(value.sessionSnapshot) && isAssetRecord(value.asset);
}
export function isScenePacketValidation(value: unknown): value is ScenePacketValidation {
  return isObject(value) && typeof value.ok === "boolean" && Array.isArray(value.errors) && value.errors.every(item => typeof item === "string");
}
export function isScenePacketResponse(value: unknown): value is ScenePacketResponse {
  return isObject(value) && isScenePacket(value.packet) && isScenePacketValidation(value.validation);
}
export function isSceneQueueResponse(value: unknown): value is SceneQueueResponse {
  return isObject(value) && isSessionSnapshot(value.sessionSnapshot) && typeof value.queuedCount === "number" &&
    Number.isSafeInteger(value.queuedCount) && value.queuedCount >= 0 && isScenePacketValidation(value.validation);
}
export function isLocalDraftResponse(value: unknown): value is LocalDraftResponse {
  return isObject(value) && isLocalModelAdapterDraft(value.draft) && isScenePacketValidation(value.validation);
}
export function isDirectorDraftResponse(value: unknown): value is DirectorDraftResponse {
  return isObject(value) && isDirectorModeAdapterDraft(value.draft) && isScenePacketValidation(value.validation);
}
export function isAudioLibraryResponse(value: unknown): value is AudioLibraryResponse {
  return isObject(value) && Array.isArray(value.tracks) && value.tracks.every(isAudioTrack);
}
export function isAudioPlaybackResponse(value: unknown): value is AudioPlaybackResponse {
  return isObject(value) && isPlaybackState(value.playbackState);
}
export function isAudioCueResponse(value: unknown): value is AudioCueResponse {
  return isObject(value) && isAudioCue(value.cue) && isAudioTrack(value.matchedTrack);
}
