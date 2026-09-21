type Receive = (raw: string) => void;
type FakeHandler = (params: Record<string, unknown>) => unknown;

let receiveRef: Receive | null = null;
let watchId: number | null = null;

type FakeClaim = { id: string; name: string; xMin: number; yMin: number; xMax: number; yMax: number; createdAt: number; status: 'complete'; bytes: number };
const fakeClaims: FakeClaim[] = [];

/** Pousse un événement comme le ferait Kotlin (navigateur du PC uniquement). */
export function emitFake(event: string, payload: unknown): void {
  receiveRef?.(JSON.stringify({ event, payload }));
}

const handlers: Record<string, FakeHandler> = {
  setBackEnabled: () => null,
  setKeepScreenOn: () => null,
  getStorageStats: () => ({ cacheBytes: 0, cacheTargetBytes: 500 * 1024 * 1024, claimBytes: 0 }),
  getSettings: () => ({ prefetchOnMobileData: localStorage.getItem('prefetchOnMobileData') === 'true' }),
  setPrefetchOnMobileData: (params) => {
    localStorage.setItem('prefetchOnMobileData', String(params.on === true));
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
  getChunkSizeAverages: () => ({}),
  getAvailableRegions: () => [],
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
  // Cap simulé : orientation absolue du navigateur si disponible, sinon touches [ et ] (±10°).
  let fakeHeading = 0;
  const emitHeading = () => emitFake('heading', { heading: fakeHeading, tilted: false, needsCalibration: false });
  window.addEventListener('deviceorientationabsolute', (event) => {
    const alpha = (event as DeviceOrientationEvent).alpha;
    if (alpha === null) return;
    fakeHeading = (360 - alpha) % 360;
    emitHeading();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== '[' && event.key !== ']') return;
    fakeHeading = (fakeHeading + (event.key === ']' ? 10 : 350)) % 360;
    emitHeading();
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
