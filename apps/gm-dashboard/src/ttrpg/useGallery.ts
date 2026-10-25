import { useEffect, useState } from "react";
import { apiFetch } from "../../../session-client";
import { startGalleryPolling, type GalleryImage } from "./gallery-poller";

export function useGallery() {
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryFull, setGalleryFull] = useState<string | null>(null);
  useEffect(() => startGalleryPolling({
    async read(signal) {
      const response = await apiFetch("/api/images", { signal });
      if (!response.ok) throw new Error("Gallery unavailable");
      return response.json();
    },
    update: setGalleryImages
  }), []);
  return { request: apiFetch, galleryImages, galleryFull, setGalleryFull };
}
