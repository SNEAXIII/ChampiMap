# MapLibre GL JS plutôt que Leaflet

Le cahier des charges initial prévoyait Leaflet. Mais le mode Suivi fait tourner la carte selon le cap du téléphone, et Leaflet ne sait pas tourner nativement : il faudrait le plugin tiers `leaflet-rotate`, qui fait tourner la carte en CSS avec des risques de bugs sur marqueurs, popups et gestes. MapLibre GL JS gère la rotation nativement (WebGL) et affiche très bien les tuiles raster IGN. Le bundle plus lourd ne compte pas, puisqu'il est embarqué dans l'APK.
