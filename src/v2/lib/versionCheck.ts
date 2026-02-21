const VERSION_CHECK_INTERVAL = 60_000; // 60 seconds
const VERSION_URL = '/version.json';

let currentVersion: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function startVersionCheck(onUpdate: () => void): void {
  // Capture current version on first load
  fetchVersion().then((v) => {
    currentVersion = v;
  });

  intervalId = setInterval(async () => {
    const latest = await fetchVersion();
    if (latest && currentVersion && latest !== currentVersion) {
      onUpdate();
      stopVersionCheck();
    }
  }, VERSION_CHECK_INTERVAL);
}

export function stopVersionCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
