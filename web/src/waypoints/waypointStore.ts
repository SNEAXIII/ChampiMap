import { openDB } from 'idb';

export type Waypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  createdAt: number; // ms depuis epoch
  updatedAt: number;
  deletedAt: number | null; // suppression logique : la sync doit propager la suppression
  dirty: boolean; // true = waypoint local (dernière version pas encore envoyée au cloud)
};

const dbPromise = openDB('champi-map', 1, {
  upgrade(db) {
    db.createObjectStore('waypoints', { keyPath: 'id' });
  },
});

let all: Waypoint[] = [];
let visible: Waypoint[] = [];
const listeners = new Set<() => void>();

function replaceAll(next: Waypoint[]): void {
  all = next;
  visible = next.filter((waypoint) => waypoint.deletedAt === null);
  listeners.forEach((listener) => listener());
}

export async function loadWaypoints(): Promise<void> {
  const db = await dbPromise;
  replaceAll(await db.getAll('waypoints'));
  // Tant que la synchro n'a pas tourné, l'appareil détient la seule copie des waypoints :
  // on demande au navigateur de ne pas l'effacer sous pression de stockage.
  void navigator.storage?.persist?.();
}

export function subscribeWaypoints(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVisibleWaypoints = (): Waypoint[] => visible;
export const getAllWaypoints = (): Waypoint[] => all;

// Invariant : lire `getAllWaypoints()` puis appeler `saveWaypoints` sans `await` entre les deux,
// sinon une écriture concurrente (une autre sauvegarde, ou la sync) peut être écrasée.
export async function saveWaypoints(changed: Waypoint[]): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction('waypoints', 'readwrite');
  await Promise.all([...changed.map((waypoint) => tx.store.put(waypoint)), tx.done]);
  const byId = new Map(all.map((waypoint) => [waypoint.id, waypoint]));
  changed.forEach((waypoint) => byId.set(waypoint.id, waypoint));
  replaceAll([...byId.values()]);
}

export async function createWaypoint(name: string, latitude: number, longitude: number): Promise<Waypoint> {
  const now = Date.now();
  const waypoint: Waypoint = {
    id: crypto.randomUUID(),
    name,
    latitude,
    longitude,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  };
  await saveWaypoints([waypoint]);
  return waypoint;
}

async function updateWaypoint(id: string, change: Partial<Pick<Waypoint, 'name' | 'deletedAt'>>): Promise<void> {
  const current = all.find((waypoint) => waypoint.id === id);
  if (!current) return;
  // Toujours strictement croissant par rapport à la version connue : si l'horloge du téléphone est en retard
  // (ou en retard sur la ligne serveur déjà récupérée), Date.now() seul pourrait être <= updatedAt et le
  // trigger serveur (20260915000000_waypoints.sql) jetterait silencieusement l'upsert.
  const updatedAt = Math.max(Date.now(), current.updatedAt + 1);
  await saveWaypoints([{ ...current, ...change, updatedAt, dirty: true }]);
}

export const renameWaypoint = (id: string, name: string) => updateWaypoint(id, { name });
export const deleteWaypoint = (id: string) => updateWaypoint(id, { deletedAt: Date.now() });

export function defaultWaypointName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Waypoint ${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Vide les waypoints locaux (déconnexion ou changement de compte, après la dernière sync). */
export async function clearWaypoints(): Promise<void> {
  const db = await dbPromise;
  await db.clear('waypoints');
  replaceAll([]);
}
