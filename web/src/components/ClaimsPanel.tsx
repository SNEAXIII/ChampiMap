import { useState } from 'react';
import { LuX } from 'react-icons/lu';
import { callNative, type Claim, type ClaimProgress } from '../bridge/bridge';
import { formatBytes } from '../format/formatBytes';

type Props = {
  claims: Claim[];
  progress: Record<string, ClaimProgress>;
  onNewClaim: () => void;
  onShow: (claim: Claim) => void;
  onClose: () => void;
};

function statusText(claim: Claim, progress: ClaimProgress | undefined): string {
  if (claim.status === 'complete') return 'Complète';
  if (!progress) return 'En attente';
  if (progress.waitingForNetwork) return 'En pause (pas de réseau)';
  if (progress.retryFailures > 0) return 'Nouvel essai dans 1 min';
  return `${Math.floor((progress.done * 100) / Math.max(1, progress.total))} %`;
}

function ClaimRow({ claim, progress, onShow }: { claim: Claim; progress: ClaimProgress | undefined; onShow: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(claim.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <li className="border-b border-gray-100 px-4 py-3">
      {renaming ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            setError(false);
            try {
              await callNative('renameClaim', { id: claim.id, name: trimmed });
              setRenaming(false);
              setBusy(false);
            } catch (err) {
              console.error('Renommage de la zone impossible', err);
              setError(true);
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <input aria-label="Nouveau nom" value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base" />
            <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 font-medium text-white disabled:opacity-60">
              OK
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              Action impossible sur l'appareil.
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{claim.name}</span>
            <span className="text-sm whitespace-nowrap text-gray-500">{statusText(claim, progress)}</span>
          </div>
          <p className="text-sm text-gray-500">
            {formatBytes(claim.bytes)} · {new Date(claim.createdAt).toLocaleDateString('fr-FR')}
          </p>
          {claim.status === 'downloading' && progress && (
            <p className="text-sm text-gray-500 tabular-nums">
              {progress.retryFailures > 0
                ? `${progress.retryFailures.toLocaleString('fr-FR')} image${progress.retryFailures > 1 ? 's' : ''} en échec`
                : `${progress.done.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')} images`}
            </p>
          )}
          <div className="mt-2 flex gap-2 text-sm">
            <button type="button" onClick={onShow} className="rounded-lg bg-gray-100 px-3 py-2 font-medium">
              Voir sur la carte
            </button>
            <button type="button" onClick={() => setRenaming(true)} className="rounded-lg bg-gray-100 px-3 py-2 font-medium">
              Renommer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setBusy(true);
                setError(false);
                try {
                  await callNative('deleteClaim', { id: claim.id });
                } catch (err) {
                  console.error('Suppression de la zone impossible', err);
                  setError(true);
                  setBusy(false);
                }
              }}
              className={`rounded-lg px-3 py-2 font-medium disabled:opacity-60 ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
            >
              {confirmDelete ? 'Confirmer' : 'Supprimer'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              Action impossible sur l'appareil.
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function ClaimsPanel({ claims, progress, onNewClaim, onShow, onClose }: Props) {
  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <h2 className="text-lg font-semibold">Zones hors ligne</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-gray-500">
          <LuX size={24} aria-hidden />
        </button>
      </header>
      <div className="p-3">
        <button type="button" onClick={onNewClaim} className="w-full rounded-lg bg-emerald-700 py-3 font-medium text-white">
          + Nouvelle zone hors ligne
        </button>
      </div>
      {claims.length === 0 ? (
        <p className="p-6 text-center text-gray-500">Aucune zone. Télécharge une zone avant de partir sans réseau.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {claims.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} progress={progress[claim.id]} onShow={() => onShow(claim)} />
          ))}
        </ul>
      )}
    </section>
  );
}
