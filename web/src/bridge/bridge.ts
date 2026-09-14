import { createFakeNative } from './fakeNative';

/** Méthodes exposées par Kotlin : paramètres et résultat. */
export type BridgeMethods = {
  setBackEnabled: { params: { enabled: boolean }; result: null };
};

/** Événements poussés par Kotlin. */
export type BridgeEvents = {
  back: null;
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
  const message = JSON.parse(raw) as IncomingMessage;
  if (message.event !== undefined) {
    listeners.get(message.event)?.forEach((listener) => listener(message.payload));
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
