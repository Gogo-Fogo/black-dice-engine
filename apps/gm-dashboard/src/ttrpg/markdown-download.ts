/** Own object URLs until download dispatch settles or the host screen unmounts. */
export function createMarkdownDownloads({ createUrl, revokeUrl, dispatch }: {
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  dispatch: (url: string, filename: string) => void;
}) {
  const urls = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    download(blob: Blob, filename: string) {
      const url = createUrl(blob);
      try {
        dispatch(url, filename);
        urls.set(url, setTimeout(() => { urls.delete(url); revokeUrl(url); }, 1000));
      } catch (error) { revokeUrl(url); throw error; }
    },
    dispose() {
      for (const [url, timer] of urls) { clearTimeout(timer); revokeUrl(url); }
      urls.clear();
    }
  };
}
