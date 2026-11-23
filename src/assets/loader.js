export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} while fetching ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

// Повтор з exponential backoff + jitter, БЕЗ ретраю на 4xx та AbortError
export async function withRetry(fn, { attempts = 3, baseMs = 200, signal } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') throw err;
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        throw err;
      }
      if (i < attempts - 1) {
        const backoff = baseMs * Math.pow(2, i);
        const jitter = Math.random() * 100;
        await sleep(backoff + jitter, signal);
      }
    }
  }
  throw lastError;
}

// Спільний fetchJson, який перевіряє response.ok
export async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  return await res.json();
}

export function loadJson(url, { signal } = {}) {
  return withRetry(() => fetchJson(url, { signal }), { signal });
}

export function loadImage(src, { signal } = {}) {
  return withRetry(
    () =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          return reject(new DOMException('Aborted', 'AbortError'));
        }
        const img = new Image();
        const onAbort = () => {
          img.src = '';
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        img.onload = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve(img);
        };
        img.onerror = () => {
          signal?.removeEventListener('abort', onAbort);
          reject(new HttpError(404, src));
        };
        img.src = src;
      }),
    { signal }
  );
}

export function loadAudio(audioCtx, url, { signal } = {}) {
  return withRetry(
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new HttpError(res.status, url);
      }
      const arrayBuffer = await res.arrayBuffer();
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return await audioCtx.decodeAudioData(arrayBuffer);
    },
    { signal }
  );
}

export async function loadAll(manifest, { audioCtx, onProgress, signal } = {}) {
  const t0 = performance.now();
  const tasks = [];

  const result = {
    sheet: null,
    frames: manifest.frames || {},
    sounds: {},
    arena: null
  };

  if (manifest.sprites?.sheet) {
    tasks.push({
      label: manifest.sprites.sheet,
      run: () => loadImage(manifest.sprites.sheet, { signal }).then((img) => (result.sheet = img))
    });
  }

  for (const [name, url] of Object.entries(manifest.sounds || {})) {
    tasks.push({
      label: url,
      run: () => loadAudio(audioCtx, url, { signal }).then((buf) => (result.sounds[name] = buf))
    });
  }

  if (manifest.arena) {
    tasks.push({
      label: manifest.arena,
      run: () => loadJson(manifest.arena, { signal }).then((data) => (result.arena = data))
    });
  }

  const total = tasks.length || 1;
  let done = 0;
  onProgress?.(0, 'Starting...');

  await Promise.all(
    tasks.map((task) =>
      task.run().then((val) => {
        done++;
        onProgress?.(done / total, task.label);
        return val;
      })
    )
  );

  result.loadTimeMs = Math.round(performance.now() - t0);
  return result;
}