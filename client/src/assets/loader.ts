export interface AssetManifest {
  readonly sounds?: Readonly<Record<string, string>>;
  readonly images?: Readonly<Record<string, string>>;
}

export interface LoadedAssets {
  readonly sounds: Readonly<Record<string, AudioBuffer>>;
  readonly images: Readonly<Record<string, HTMLImageElement>>;
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }
  return (await res.json()) as T; // Parsed JSON boundary validated by caller/manifest
}

export async function loadAll(
  manifest: AssetManifest,
  options: {
    audioCtx?: AudioContext | null;
    onProgress?: (progress: number, label: string) => void;
  } = {}
): Promise<LoadedAssets> {
  const soundEntries = Object.entries(manifest.sounds ?? {});
  const total = Math.max(1, soundEntries.length);
  let loaded = 0;

  const sounds: Record<string, AudioBuffer> = {};

  for (const [key, url] of soundEntries) {
    options.onProgress?.(loaded / total, `Loading ${key}...`);
    try {
      const res = await fetch(url);
      if (res.ok && options.audioCtx) {
        const buf = await res.arrayBuffer();
        sounds[key] = await options.audioCtx.decodeAudioData(buf);
      }
    } catch {
      // Optional audio asset failure does not block game startup
    }
    loaded++;
  }

  options.onProgress?.(1, 'Ready');
  return { sounds, images: {} };
}