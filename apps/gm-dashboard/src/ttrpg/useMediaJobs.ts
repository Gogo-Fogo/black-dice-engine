import { useState } from "react";
import { apiFetch } from "../../../session-client";
import { createMediaJobActions, type MediaJobDependencies } from "./media-job-actions";

export function useMediaJobs(dependencies: Omit<MediaJobDependencies, "request" | "setMediaQueueStatus">) {
  const [mediaQueueStatus, setMediaQueueStatus] = useState("");
  const actions = createMediaJobActions({ ...dependencies, request: apiFetch, setMediaQueueStatus });
  return { mediaQueueStatus, setMediaQueueStatus, ...actions };
}
