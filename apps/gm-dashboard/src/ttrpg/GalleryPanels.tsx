import { AssetImage } from "./AssetImage";
import React from "react";
import type { useGallery } from "./useGallery";

export function LatestScenePanel({ gallery, scene }: { gallery: ReturnType<typeof useGallery>; scene: string }) {
  const { galleryImages, setGalleryFull } = gallery;
  return (
        galleryImages.length > 0 ? (
          <article className="panel" id="scene-image-hero">
            <div className="panel-header">
              <h2>🏞 Latest Scene</h2>
              <span>{scene}</span>
            </div>
            <AssetImage request={gallery.request}
              src={galleryImages[0].url}
              alt="Current scene"
              style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
              onClick={() => setGalleryFull(galleryImages[0].url)}
            />
          </article>
        ) : null
  );
}

export function GalleryPanel({ gallery }: { gallery: ReturnType<typeof useGallery> }) {
  const { galleryImages, setGalleryFull } = gallery;
  return (
        galleryImages.length > 0 ? (
          <article className="panel">
            <div className="panel-header">
              <h2>🖼 All Images</h2>
              <span>{galleryImages.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {galleryImages.map((img) => (
                <AssetImage request={gallery.request}
                  key={img.filename}
                  src={img.url}
                  alt={img.filename}
                  loading="lazy"
                  style={{
                    width: 160, height: 110, objectFit: "cover",
                    cursor: "pointer", borderRadius: 6,
                    border: "2px solid #333"
                  }}
                  onClick={() => setGalleryFull(img.url)}
                />
              ))}
          </div>
        </article>
        ) : null
  );
}

export function GalleryPreview({ gallery }: { gallery: ReturnType<typeof useGallery> }) {
  const { galleryFull, setGalleryFull } = gallery;
  return (
        galleryFull ? (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
              zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer"
            }}
            onClick={() => setGalleryFull(null)}
          >
            <AssetImage request={gallery.request} src={galleryFull} alt="Expanded scene" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
          </div>
        ) : null
  );
}
