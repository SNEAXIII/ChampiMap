type Receive = (raw: string) => void;
type FakeHandler = (params: Record<string, unknown>) => unknown;

let receiveRef: Receive | null = null;
let watchId: number | null = null;

/** Pousse un événement comme le ferait Kotlin (navigateur du PC uniquement). */
export function emitFake(event: string, payload: unknown): void {
  receiveRef?.(JSON.stringify({ event, payload }));
}

const handlers: Record<string, FakeHandler> = {
  setBackEnabled: () => null,
  setKeepScreenOn: () => null,
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
