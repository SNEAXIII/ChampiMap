export type FollowMode = 'free' | 'centered' | 'follow';

type Props = {
  mode: FollowMode;
  onPress: () => void;
};

const LABELS: Record<FollowMode, string> = {
  free: 'Me localiser',
  centered: 'Suivre ma position',
  follow: 'Arrêter le suivi',
};

export function LocateButton({ mode, onPress }: Props) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={LABELS[mode]}
      className={`absolute right-3 bottom-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl shadow-lg ${
        mode === 'free' ? 'text-gray-600' : 'text-blue-600'
      }`}
    >
      {mode === 'follow' ? '◉' : '◎'}
    </button>
  );
}
