import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ title, onClose, children }: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full px-3 py-1 text-gray-500">
          <LuX size={24} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}
