import React, { useEffect, useState } from "react";
import { loadAssetImage } from "./asset-image";

/** Image tags cannot attach Bearer credentials. Own a private blob URL instead. */
export function AssetImage({ src, request, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { request?: typeof fetch }) {
  const [image, setImage] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    if (!request || !src) return;
    return loadAssetImage(src, request, url => setImage({ source: src, url }));
  }, [src, request]);
  return <img {...props} src={image && image.source === src ? image.url : undefined} />;
}
