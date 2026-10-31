import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';
import { callNative, type AppSettings, type StorageStats } from '../bridge/bridge';
import { AccountSection } from './AccountSection';
import { formatBytes } from '../format/formatBytes';

type Props = {
  onClose: () => void;
};

export function SettingsPanel({ onClose }: Props) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const fetchStats = () =>
      callNative('getStorageStats', {})
        .then(setStats)
        .catch((error: unknown) => {
          console.warn(error);
          setStatsUnavailable(true);
        });
    fetchStats();
    // Pré-téléchargement et nettoyage tournent en tâche de fond : rafraîchir pendant que le panneau est
    // ouvert évite d'avoir à le refermer puis le rouvrir pour voir le stockage évoluer.
    const interval = setInterval(fetchStats, 3_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Échec silencieux (hors console) : la case reste désactivée (settings reste null), ce qui est le
    // comportement voulu quand on ne connaît pas l'état réel du réglage.
    callNative('getSettings', {}).then(setSettings).catch(console.warn);
  }, []);

  const togglePrefetch = async () => {
    if (!settings) return;
    const next = !settings.prefetchOnMobileData;
    try {
      await callNative('setPrefetchOnMobileData', { on: next });
      setSettings((s) => s && { ...s, prefetchOnMobileData: next });
    } catch (error) {
      console.warn(error);
    }
  };

  const changeGpsInterval = (seconds: number) => {
    setSettings((s) => s && { ...s, gpsIntervalSeconds: seconds });
    callNative('setGpsInterval', { seconds }).catch(console.warn);
  };

  const changeCacheLimit = (mb: number) => {
    setSettings((s) => s && { ...s, cacheLimitMb: mb });
    callNative('setCacheLimit', { mb }).catch(console.warn);
  };

  const clearCache = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    try {
      await callNative('clearCache', {});
      setStats(await callNative('getStorageStats', {}));
    } catch (error) {
      console.warn(error);
    }
    setClearing(false);
    setConfirmClear(false);
  };

  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <h2 className="text-lg font-semibold">Paramètres</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-gray-500">
          <LuX size={24} aria-hidden />
        </button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <AccountSection />
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Stockage</h3>
          {stats ? (
            <ul className="space-y-1">
              <li>
                Cartes vues récemment : {formatBytes(stats.cacheBytes)} / {formatBytes(stats.cacheTargetBytes)}
              </li>
              <li>Zones hors ligne : {formatBytes(stats.claimBytes)}</li>
            </ul>
          ) : statsUnavailable ? (
            <p className="text-gray-500">Indisponible</p>
          ) : (
            <p className="text-gray-500">Calcul…</p>
          )}
          <label className="mt-4 block">
            <span>Cartes vues récemment : {formatBytes((settings?.cacheLimitMb ?? 500) * 1024 * 1024)} max</span>
            <input
              type="range"
              min={100}
              max={1000}
              step={100}
              className="mt-2 block w-full"
              value={settings?.cacheLimitMb ?? 500}
              disabled={!settings}
              onChange={(event) => changeCacheLimit(Number(event.target.value))}
            />
            <span className="block text-sm text-gray-500">
              Au-delà, les cartes vues il y a le plus longtemps sont effacées. Les zones hors ligne ne sont jamais
              effacées.
            </span>
          </label>
          <button
            type="button"
            disabled={clearing}
            onClick={clearCache}
            className={`mt-4 rounded-lg px-3 py-2 font-medium disabled:opacity-60 ${confirmClear ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
          >
            {clearing ? 'Nettoyage…' : confirmClear ? 'Confirmer : vider les cartes vues récemment' : 'Vider les cartes vues récemment'}
          </button>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Autour de moi</h3>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={settings?.prefetchOnMobileData ?? false}
              disabled={!settings}
              onChange={togglePrefetch}
            />
            <span>
              Pré-télécharger la carte autour de moi aussi en données mobiles
              <span className="block text-sm text-gray-500">
                En Wi-Fi, c'est automatique quand la position est suivie. Compter 100 à 250 Mo à chaque nouveau
                secteur.
              </span>
            </span>
          </label>
          <label className="mt-4 block">
            <span>Position GPS toutes les {settings?.gpsIntervalSeconds ?? 5} s</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              className="mt-2 block w-full"
              value={settings?.gpsIntervalSeconds ?? 5}
              disabled={!settings}
              onChange={(event) => changeGpsInterval(Number(event.target.value))}
            />
            <span className="block text-sm text-gray-500">
              Plus court : direction de marche plus réactive, mais batterie plus sollicitée. Seulement app à
              l'écran (30 s en arrière-plan).
            </span>
          </label>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">À propos</h3>
          <p className="text-sm text-gray-600">Carte : © IGN – Plan IGN</p>
        </section>
      </div>
    </section>
  );
}
