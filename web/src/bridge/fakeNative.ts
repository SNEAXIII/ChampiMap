type Receive = (raw: string) => void;
type FakeHandler = (params: Record<string, unknown>) => unknown;

let receiveRef: Receive | null = null;
let watchId: number | null = null;

type FakeClaim = { id: string; name: string; xMin: number; yMin: number; xMax: number; yMax: number; createdAt: number; status: 'complete'; bytes: number };
const fakeClaims: FakeClaim[] = [];

type FakeTrackPoint = { latitude: number; longitude: number; time: number };
const TRACK_KEY = 'fakeTrack';

function readFakeTrack(): FakeTrackPoint[] {
  try {
    return JSON.parse(localStorage.getItem(TRACK_KEY) ?? '[]') as FakeTrackPoint[];
  } catch {
    return [];
  }
}

/** Même règle que TrackStore.kt (simplifiée) : précision ≤ 30 m, au moins 10 m du dernier point. */
function recordFakeTrack(point: FakeTrackPoint, accuracy: number): void {
  if (accuracy > 30) return;
  const track = readFakeTrack();
  const last = track.at(-1);
  if (last) {
    const dLat = (point.latitude - last.latitude) * 111_320;
    const dLon = (point.longitude - last.longitude) * 111_320 * Math.cos((point.latitude * Math.PI) / 180);
    if (Math.hypot(dLat, dLon) < 10) return;
  }
  track.push(point);
  localStorage.setItem(TRACK_KEY, JSON.stringify(track.slice(-5000)));
  emitFake('trackPoint', point);
}

/** Pousse un événement comme le ferait Kotlin (navigateur du PC uniquement). */
export function emitFake(event: string, payload: unknown): void {
  receiveRef?.(JSON.stringify({ event, payload }));
}

const handlers: Record<string, FakeHandler> = {
  setBackEnabled: () => null,
  setKeepScreenOn: () => null,
  getStorageStats: () => ({ cacheBytes: 0, cacheTargetBytes: 500 * 1024 * 1024, claimBytes: 0 }),
  getSettings: () => ({
    prefetchOnMobileData: localStorage.getItem('prefetchOnMobileData') === 'true',
    gpsIntervalSeconds: Number(localStorage.getItem('gpsIntervalSeconds') ?? 5),
    cacheLimitMb: Number(localStorage.getItem('cacheLimitMb') ?? 500),
  }),
  setPrefetchOnMobileData: (params) => {
    localStorage.setItem('prefetchOnMobileData', String(params.on === true));
    return null;
  },
  // Sans effet sur le GPS du navigateur : seulement mémorisé pour le curseur.
  setGpsInterval: (params) => {
    localStorage.setItem('gpsIntervalSeconds', String(params.seconds));
    return null;
  },
  clearCache: () => null,
  setCacheLimit: (params) => {
    localStorage.setItem('cacheLimitMb', String(params.mb));
    return null;
  },
  // Navigateur du PC : pas de téléchargement, une zone est « complète » dès sa création.
  listClaims: () => [...fakeClaims],
  createClaim: (params) => {
    fakeClaims.unshift({ ...(params as Omit<FakeClaim, 'createdAt' | 'status' | 'bytes'>), createdAt: Date.now(), status: 'complete', bytes: 0 });
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  renameClaim: (params) => {
    const claim = fakeClaims.find((c) => c.id === params.id);
    if (claim) claim.name = String(params.name);
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  deleteClaim: (params) => {
    const index = fakeClaims.findIndex((c) => c.id === params.id);
    if (index >= 0) fakeClaims.splice(index, 1);
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  getTrack: () => readFakeTrack(),
  clearTrack: () => {
    localStorage.removeItem(TRACK_KEY);
    setTimeout(() => emitFake('trackChanged', null), 0);
    return null;
  },
  getChunkSizeAverages: () => ({}),
  getAvailableRegions: () => [],
  getCompleteRegions: () => [],
  startLocation: () => {
    if (watchId !== null || !('geolocation' in navigator)) return null;
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        emitFake('location', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          time: position.timestamp,
        });
        emitFake('locationState', { running: true, permissionDenied: false });
        recordFakeTrack(
          { latitude: position.coords.latitude, longitude: position.coords.longitude, time: position.timestamp },
          position.coords.accuracy,
        );
      },
      (error) => {
        // Permission refusée : la position ne viendra jamais, on libère watchId pour qu'un nouveau
        // démarrage (retry) relance vraiment watchPosition au lieu de sortir tôt ci-dessus.
        if (error.code === error.PERMISSION_DENIED && watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        emitFake('locationState', { running: false, permissionDenied: error.code === error.PERMISSION_DENIED });
      },
      { enableHighAccuracy: true },
    );
    return null;
  },
};

/** Remplace le Kotlin quand l'app tourne dans le navigateur du PC. */
export function createFakeNative(receive: Receive): { postMessage(message: string): void } {
  receiveRef = receive;
  // Échap joue le rôle du bouton retour Android.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') emitFake('back', null);
  });
  return {
    postMessage(message: string) {
      const { id, method, params } = JSON.parse(message) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      const handler = handlers[method];
      const reply = handler ? { id, result: handler(params) ?? null } : { id, error: `Méthode inconnue : ${method}` };
      setTimeout(() => receive(JSON.stringify(reply)), 0);
    },
  };
}
