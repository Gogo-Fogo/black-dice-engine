import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AssetRecord } from "../../../packages/contracts/dist/index.js";
import type { LocalIdentity } from "./session-authority.js";
import { SessionError } from "./session-authority.js";

export function assetVisible(asset: AssetRecord, viewer: LocalIdentity) {
  return asset.status === "approved" && (viewer.role === "gm" || asset.visibility === "public_demo" ||
    viewer.role === "player" && asset.visibility === "player_visible");
}
const contained = (root: string, path: string) => { const part = relative(root, path); return part !== "" && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part); };

/** Resolve only an existing record under configured roots. No directory enumeration or arbitrary request path. */
export function createAssetDelivery(roots: string[]) {
  const configured = roots.filter(Boolean).map(root => resolve(root));
  return async (asset: AssetRecord) => {
    try {
      if (!asset.localPath || !isAbsolute(asset.localPath)) throw new Error();
      const path = resolve(asset.localPath), root = configured.find(root => contained(root, path));
      if (!root) throw new Error();
      const actualRoot = await realpath(root), actual = await realpath(path);
      if (!contained(actualRoot, actual)) throw new Error();
      const file = await open(actual, "r");
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size < 12 || stat.size > 64 * 1024 * 1024) throw new Error();
        const bytes = Buffer.alloc(stat.size); let offset = 0;
        while (offset < bytes.length) { const read = await file.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) throw new Error(); offset += read.bytesRead; }
        if ((await file.stat()).size !== stat.size) throw new Error();
        const extension = extname(actual).toLowerCase();
        let type = "";
        if (["image", "map", "handout"].includes(asset.kind)) {
          if (extension === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = "image/png";
          if ([".jpg", ".jpeg"].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = "image/jpeg";
          if (extension === ".webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") type = "image/webp";
        }
        if (asset.kind === "audio" && extension === ".wav" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") type = "audio/wav";
        if (asset.kind === "audio" && extension === ".mp3" && (bytes.toString("ascii", 0, 3) === "ID3" || bytes[0] === 255 && (bytes[1] & 224) === 224)) type = "audio/mpeg";
        if (asset.kind === "video" && extension === ".mp4" && bytes.toString("ascii", 4, 8) === "ftyp") type = "video/mp4";
        if (!type) throw new Error();
        return { bytes, type, mtime: stat.mtimeMs };
      } finally { await file.close(); }
    } catch { throw new SessionError(404, "Asset file is unavailable or unsupported."); }
  };
}
