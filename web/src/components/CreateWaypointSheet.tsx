import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords, type LatLon } from '../geo/geo';
import { DEFAULT_ICON_ID } from '../waypoints/icons';
import { IconPicker } from './IconPicker';

type Props = {
  position: LatLon;
  defaultName: string;
  onCreate: (name: string, icon: string) => Promise<void>;
  onCancel: () => void;
};

export function CreateWaypointSheet({ position, defaultName, onCreate, onCancel }: Props) {
  const [name, setName] = useState(defaultName);
  const [icon, setIcon] = useState(DEFAULT_ICON_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <BottomSheet title="Nouveau point" onClose={onCancel}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(false);
          try {
            await onCreate(name.trim() || defaultName, icon);
          } catch (err) {
            console.error('Création du point impossible', err);
            setError(true);
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Nom du point"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <IconPicker value={icon} onChange={setIcon} />
        <p className="text-sm text-gray-500">{formatCoords(position)}</p>
        {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
            Annuler
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white disabled:opacity-60">
            Créer
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
