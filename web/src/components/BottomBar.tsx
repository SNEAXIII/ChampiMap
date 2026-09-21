import type { IconType } from 'react-icons';
import { LuMap, LuMapPin, LuSettings } from 'react-icons/lu';

export type BottomBarTab = 'waypoints' | 'claims' | 'settings';

type Props = {
  active: BottomBarTab | null;
  onOpenWaypoints: () => void;
  onOpenClaims: () => void;
  onOpenSettings: () => void;
};

function BarButton({ icon: Icon, label, active, onClick }: { icon: IconType; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-800' : 'text-gray-700'}`}
    >
      {/* Barre d'onglet actif, sur toute la largeur de l'onglet, par-dessus la bordure de la barre. */}
      {active && <span className="absolute inset-x-0 -top-px h-0.5 bg-emerald-700" />}
      <Icon size={22} aria-hidden />
      {label}
    </button>
  );
}

export function BottomBar({ active, onOpenWaypoints, onOpenClaims, onOpenSettings }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon={LuMapPin} label="Points" active={active === 'waypoints'} onClick={onOpenWaypoints} />
      <BarButton icon={LuMap} label="Zones hors ligne" active={active === 'claims'} onClick={onOpenClaims} />
      <BarButton icon={LuSettings} label="Paramètres" active={active === 'settings'} onClick={onOpenSettings} />
    </nav>
  );
}
