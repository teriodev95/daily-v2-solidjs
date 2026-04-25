const VERSION_CHECK_INTERVAL = 60_000; // 60 seconds
const VERSION_URL = '/version.json';

let currentVersion: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let updateFired = false;

const isLocalHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const shouldCheckVersion = (): boolean =>
  typeof window !== 'undefined' && !import.meta.env.DEV && !isLocalHost();

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
  if (!shouldCheckVersion() || intervalId) return;

  updateFired = false;

  // Capture current version on first load
  fetchVersion().then((v) => {
    currentVersion = v;
  });

  intervalId = setInterval(async () => {
    if (updateFired) return;
    const latest = await fetchVersion();
    if (latest && !currentVersion) {
      currentVersion = latest;
      return;
    }
    if (latest && currentVersion && latest !== currentVersion) {
      updateFired = true;
      stopVersionCheck();
      onUpdate();
    }
  }, VERSION_CHECK_INTERVAL);
}

export function stopVersionCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
