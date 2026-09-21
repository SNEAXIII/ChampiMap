import { waypointIcon } from '../waypoints/icons';

type Props = {
  icon: string;
  /** Diamètre en px. */
  size?: number;
};

/** Pastille ronde de la couleur de l'icône, icône blanche au centre. */
export function WaypointGlyph({ icon, size = 32 }: Props) {
  const { Icon, color } = waypointIcon(icon);
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full text-white" style={{ width: size, height: size, backgroundColor: color }}>
      <Icon size={Math.round(size * 0.58)} aria-hidden />
    </span>
  );
}
