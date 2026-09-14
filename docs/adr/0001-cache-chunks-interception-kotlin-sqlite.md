# Cache de chunks servi par Kotlin via interception WebView, stocké en SQLite

La carte demande ses chunks à une URL fictive (`https://tiles.app/{z}/{x}/{y}`). `WebViewClient.shouldInterceptRequest` sert le chunk depuis une base SQLite unique s'il existe, sinon le télécharge chez l'IGN, l'enregistre, puis le renvoie. On a choisi cette solution plutôt que de gérer le cache en TypeScript (IndexedDB, ou blobs passés en base64 par le bridge JS) : faire transiter des centaines de Mo d'images par le bridge est lent, et IndexedDB est fragile à cette échelle.

Le téléchargement des claims et le pré-téléchargement autour de la position tournent aussi en Kotlin, dans le service au premier plan. Android met en pause le JavaScript d'une WebView en arrière-plan, or ces téléchargements doivent continuer écran verrouillé. Kotlin sait donc calculer les chunks d'un claim. Le TypeScript garde l'UI, la sélection, l'estimation de taille et l'affichage de la progression.

## Considered Options

- **Fichiers `z/x/y.png`** : écartés. Il faudrait un index séparé pour la taille et la date d'accès, sans garantie transactionnelle en cas de crash pendant un téléchargement. SQLite gère ça nativement et reste rapide pour des blobs de 20 à 100 KB.
- **Fichiers région façon `.mca`** : écartés. Supprimer un chunk oblige à compacter le fichier.

## Consequences

- La propriété « claimé » n'est pas stockée par chunk. Elle se calcule à partir des coins des claims : pas de compteur de références qui pourrait dériver après un crash.
- L'app web doit être embarquée dans l'APK (`WebViewAssetLoader`) pour démarrer en mode avion.
