import { supabase } from '../lib/supabase';
import { getAllWaypoints, saveWaypoints, subscribeWaypoints, type Waypoint } from '../waypoints/waypointStore';

export type SyncState = { syncing: boolean; lastError: string | null; lastSyncedAt: number | null };

type Row = {
  id: string;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  synced_at: string;
};

const PAGE_SIZE = 500;
const DEBOUNCE_MS = 3000;
const cursorKey = (userId: string) => `champi.sync.cursor.${userId}`;
// `synced_at` est posé par le trigger serveur à l'engagement (commit) de la transaction, mais des
// transactions concurrentes peuvent valider dans le désordre : un pull qui a déjà avancé son curseur
// au-delà de T2 pourrait alors ignorer une ligne validée plus tard avec T1 < T2 (T1 < T2 mais commit(T1) après commit(T2)).
// On rejoue donc les 5 dernières minutes à chaque pull ; les lignes re-reçues sont sans danger, la fusion étant idempotente.
const PULL_OVERLAP_MS = 5 * 60_000;
const EPOCH = '1970-01-01T00:00:00Z';

let state: SyncState = { syncing: false, lastError: null, lastSyncedAt: null };
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let debounceTimer: number | undefined;

function setState(change: Partial<SyncState>): void {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

export const getSyncState = (): SyncState => state;

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const toRow = (waypoint: Waypoint, userId: string): Omit<Row, 'synced_at'> => ({
  id: waypoint.id,
  user_id: userId,
  name: waypoint.name,
  latitude: waypoint.latitude,
  longitude: waypoint.longitude,
  created_at: new Date(waypoint.createdAt).toISOString(),
  updated_at: new Date(waypoint.updatedAt).toISOString(),
  deleted_at: waypoint.deletedAt === null ? null : new Date(waypoint.deletedAt).toISOString(),
});

const fromRow = (row: Row): Waypoint => ({
  id: row.id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  createdAt: Date.parse(row.created_at),
  updatedAt: Date.parse(row.updated_at),
  deletedAt: row.deleted_at === null ? null : Date.parse(row.deleted_at),
  dirty: false,
});

async function runSync(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  const userId = session.user.id;

  setState({ syncing: true, lastError: null });
  try {
    // 1. Envoi des waypoints locaux. Le trigger serveur ignore les versions plus anciennes que celle stockée.
    const dirty = getAllWaypoints().filter((waypoint) => waypoint.dirty);
    if (dirty.length > 0) {
      const { error } = await supabase.from('waypoints').upsert(dirty.map((waypoint) => toRow(waypoint, userId)));
      if (error) throw error;
      // « Sauvegardé » seulement si le waypoint n'a pas été modifié pendant l'envoi.
      const sentVersion = new Map(dirty.map((waypoint) => [waypoint.id, waypoint.updatedAt]));
      await saveWaypoints(
        getAllWaypoints()
          .filter((waypoint) => waypoint.dirty && sentVersion.get(waypoint.id) === waypoint.updatedAt)
          .map((waypoint) => ({ ...waypoint, dirty: false })),
      );
    }

    // 2. Réception de ce qui a changé ailleurs, dans l'ordre de l'horloge serveur.
    // Le curseur persisté ne recule jamais ; seul le point de départ de la requête est décalé en arrière
    // (chevauchement) pour rattraper les commits en retard — voir PULL_OVERLAP_MS ci-dessus.
    const storedCursor = localStorage.getItem(cursorKey(userId)) ?? EPOCH;
    let queryCursor = storedCursor === EPOCH ? storedCursor : new Date(Date.parse(storedCursor) - PULL_OVERLAP_MS).toISOString();
    let maxSyncedAt = storedCursor;
    for (;;) {
      const { data: rows, error } = await supabase
        .from('waypoints')
        .select('*')
        .gt('synced_at', queryCursor)
        .order('synced_at', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      const page = rows as Row[];
      if (page.length === 0) break;

      const local = new Map(getAllWaypoints().map((waypoint) => [waypoint.id, waypoint]));
      // Le plus récent gagne : on garde la version locale si elle est plus récente (elle partira au prochain envoi).
      // Les lignes déjà à jour localement (même version, pas de modif locale en attente) sont ignorées pour éviter
      // une écriture et une notification inutiles.
      const accepted = page
        .map(fromRow)
        .filter((remote) => {
          const mine = local.get(remote.id);
          return !mine || remote.updatedAt > mine.updatedAt || (remote.updatedAt === mine.updatedAt && mine.dirty);
        });
      if (accepted.length > 0) await saveWaypoints(accepted);

      const pageLast = page[page.length - 1].synced_at;
      queryCursor = pageLast;
      if (pageLast > maxSyncedAt) {
        maxSyncedAt = pageLast;
        localStorage.setItem(cursorKey(userId), maxSyncedAt);
      }
      if (page.length < PAGE_SIZE) break;
    }
    setState({ syncing: false, lastSyncedAt: Date.now() });
  } catch (e) {
    setState({ syncing: false, lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Lance une sync (ou rejoint celle en cours). Sans session ni réseau : ne fait rien. */
export function syncNow(): Promise<void> {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

export function scheduleSync(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    syncNow().catch(() => undefined);
  }, DEBOUNCE_MS);
}

/** Déclencheurs : ouverture de l'app, connexion, retour du réseau, retour au premier plan, modification locale. */
export function startAutoSync(): void {
  if (!supabase) return;
  const quietSync = () => {
    syncNow().catch(() => undefined);
  };
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) quietSync();
  });
  window.addEventListener('online', quietSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') quietSync();
  });
  subscribeWaypoints(() => {
    if (getAllWaypoints().some((waypoint) => waypoint.dirty)) scheduleSync();
  });
}
