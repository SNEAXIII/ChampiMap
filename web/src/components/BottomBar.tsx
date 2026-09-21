export type BottomBarTab = 'waypoints' | 'claims' | 'settings';

type Props = {
  active: BottomBarTab | null;
  onOpenWaypoints: () => void;
  onOpenClaims: () => void;
  onOpenSettings: () => void;
};

function BarButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-800' : 'text-gray-700'}`}
    >
      {/* Barre d'onglet actif, collée au bord supérieur de la barre. */}
      {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-700" />}
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </button>
  );
}

export function BottomBar({ active, onOpenWaypoints, onOpenClaims, onOpenSettings }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon="📍" label="Points" active={active === 'waypoints'} onClick={onOpenWaypoints} />
      <BarButton icon="🗺️" label="Zones hors ligne" active={active === 'claims'} onClick={onOpenClaims} />
      <BarButton icon="⚙️" label="Paramètres" active={active === 'settings'} onClick={onOpenSettings} />
    </nav>
  );
}
