import { WAYPOINT_ICONS } from '../waypoints/icons';
import { WaypointGlyph } from './WaypointGlyph';

type Props = {
  value: string;
  onChange: (icon: string) => void;
};

/** Grille des icônes du catalogue ; l'icône choisie est entourée. */
export function IconPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Icône" className="grid max-h-44 grid-cols-5 gap-1 overflow-y-auto">
      {WAYPOINT_ICONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`flex flex-col items-center gap-0.5 rounded-lg p-1 text-[11px] leading-tight ${value === id ? 'bg-emerald-50 ring-2 ring-emerald-700' : ''}`}
        >
          <WaypointGlyph icon={id} size={36} />
          <span className="w-full truncate text-center text-gray-700">{label}</span>
        </button>
      ))}
    </div>
  );
}
