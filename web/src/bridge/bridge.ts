import { createFakeNative } from './fakeNative';

export type LocationFix = { latitude: number; longitude: number; accuracy: number | null; time: number };
export type Heading = { heading: number; tilted: boolean; needsCalibration: boolean };
export type StorageStats = { cacheBytes: number; cacheTargetBytes: number; claimBytes: number };
export type AppSettings = { prefetchOnMobileData: boolean };
export type Claim = {
  id: string;
  name: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  createdAt: number;
  status: 'downloading' | 'complete';
  bytes: number;
};
export type ClaimProgress = { claimId: string; done: number; total: number; waitingForNetwork: boolean };
type RegionRectParams = { xMin: number; yMin: number; xMax: number; yMax: number };

/** Méthodes exposées par Kotlin : paramètres et résultat. */
export type BridgeMethods = {
  setBackEnabled: { params: { enabled: boolean }; result: null };
  startLocation: { params: Record<string, never>; result: null };
  setKeepScreenOn: { params: { on: boolean }; result: null };
  getStorageStats: { params: Record<string, never>; result: StorageStats };
  getSettings: { params: Record<string, never>; result: AppSettings };
  setPrefetchOnMobileData: { params: { on: boolean }; result: null };
  listClaims: { params: Record<string, never>; result: Claim[] };
  createClaim: { params: RegionRectParams & { id: string; name: string }; result: null };
  renameClaim: { params: { id: string; name: string }; result: null };
  deleteClaim: { params: { id: string }; result: null };
  getChunkSizeAverages: { params: Record<string, never>; result: Record<string, number> };
  getAvailableRegions: { params: RegionRectParams; result: [number, number][] };
  googleSignIn: { params: Record<string, never>; result: { idToken: string; rawNonce: string } };
};

/** Événements poussés par Kotlin. */
export type BridgeEvents = {
  back: null;
  location: LocationFix;
  // null en mode approximatif (permission FINE non accordée) : pas de statut GNSS disponible.
  satellites: { count: number | null };
  locationState: { running: boolean; permissionDenied: boolean };
  claimProgress: ClaimProgress;
  claimsChanged: null;
  heading: Heading;
};

type NativePort = {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: { data: string }) => void): void;
};

declare global {
  interface Window {
    champiNative?: NativePort;
  }
}

type IncomingMessage = { id?: number; result?: unknown; error?: string; event?: string; payload?: unknown };

const listeners = new Map<string, Set<(payload: unknown) => void>>();
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let nextId = 1;

function receive(raw: string): void {
  // Un message malformé (bug natif, future version incompatible) ne doit pas planter la page :
  // on le journalise et on l'ignore plutôt que de laisser JSON.parse lever une exception non gérée.
  let message: IncomingMessage;
  try {
    message = JSON.parse(raw) as IncomingMessage;
  } catch (error) {
    console.warn('Message natif malformé, ignoré', raw, error);
    return;
  }
  if (message.event !== undefined) {
    // Chaque listener s'exécute isolément : un listener qui lève ne doit pas empêcher les autres
    // (et les événements suivants) de s'exécuter.
    listeners.get(message.event)?.forEach((listener) => {
      try {
        listener(message.payload);
      } catch (error) {
        console.error(`Listener pour l'événement "${message.event}" en erreur`, error);
      }
    });
    return;
  }
  if (message.id === undefined) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error !== undefined) request.reject(new Error(message.error));
  else request.resolve(message.result);
}

export const isAndroid = window.champiNative !== undefined;

const port: { postMessage(message: string): void } = window.champiNative ?? createFakeNative(receive);
window.champiNative?.addEventListener('message', (event) => receive(event.data));

export function callNative<M extends keyof BridgeMethods>(
  method: M,
  params: BridgeMethods[M]['params'],
): Promise<BridgeMethods[M]['result']> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    port.postMessage(JSON.stringify({ id, method, params }));
  });
}

export function onNative<E extends keyof BridgeEvents>(
  event: E,
  listener: (payload: BridgeEvents[E]) => void,
): () => void {
  const set = listeners.get(event) ?? new Set();
  listeners.set(event, set);
  const wrapped = listener as (payload: unknown) => void;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
  };
}
