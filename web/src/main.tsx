import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { loadWaypoints } from './waypoints/waypointStore';

loadWaypoints().catch((error) => console.error('Chargement des waypoints impossible', error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
