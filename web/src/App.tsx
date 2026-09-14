import { MapView } from './components/MapView';

const ignoreMap = () => {};

export function App() {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView onMapReady={ignoreMap} />
    </main>
  );
}
