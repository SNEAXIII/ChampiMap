import { LuCompass, LuSmartphone } from 'react-icons/lu';
import type { Heading } from '../bridge/bridge';

type Props = {
  heading: Heading | null;
  active: boolean;
};

/** Avertissements utiles seulement quand on se sert du cap (Suivi ou Cible). */
export function CompassWarnings({ heading, active }: Props) {
  if (!active || !heading || (!heading.tilted && !heading.needsCalibration)) return null;
  return (
    <div className="pointer-events-none absolute top-10 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 shadow">
      {heading.tilted ? <LuSmartphone size={18} className="shrink-0" aria-hidden /> : <LuCompass size={18} className="shrink-0" aria-hidden />}
      {heading.tilted ? 'Tiens le téléphone à plat' : 'Boussole imprécise : fais un 8 avec le téléphone'}
    </div>
  );
}
