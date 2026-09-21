import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { startAutoSync } from './sync/sync';
import { loadWaypoints } from './waypoints/waypointStore';

loadWaypoints().then(startAutoSync).catch((error) => console.error('Chargement des waypoints impossible', error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
