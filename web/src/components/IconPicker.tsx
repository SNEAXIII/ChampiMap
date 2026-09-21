import { WAYPOINT_ICONS } from '../waypoints/icons';
import { WaypointGlyph } from './WaypointGlyph';

type Props = {
  value: string;
  onChange: (icon: string) => void;
};

/** Grille des icônes du catalogue ; l'icône choisie est entourée. */
export function IconPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Icône" className="grid max-h-48 grid-cols-5 gap-1 overflow-y-auto p-0.5">
      {WAYPOINT_ICONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          // ring-inset : un anneau extérieur serait coupé par le conteneur qui défile (overflow).
          className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg p-1 text-[11px] leading-tight ${value === id ? 'bg-emerald-50 ring-2 ring-emerald-700 ring-inset' : ''}`}
        >
          <WaypointGlyph icon={id} size={36} />
          <span className="line-clamp-2 w-full text-center text-gray-700">{label}</span>
        </button>
      ))}
    </div>
  );
}
