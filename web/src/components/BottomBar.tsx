type Props = {
  onOpenWaypoints: () => void;
};

function BarButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-gray-700">
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </button>
  );
}

export function BottomBar({ onOpenWaypoints }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon="📍" label="Waypoints" onClick={onOpenWaypoints} />
    </nav>
  );
}
