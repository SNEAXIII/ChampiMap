# Champi Map — Phase 1 : squelette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app Android (WebView Kotlin) qui affiche en plein écran une carte MapLibre avec le Plan IGN. Rechargement à chaud sur le téléphone en debug, app web embarquée dans l'APK en release.

**Architecture:** Dépôt unique :
- `web/` : Vite + React + TS + Tailwind. Un seul composant carte, avec la source Plan IGN isolée dans `web/src/map/ign.ts`.
- `android/` : un module `app` avec une seule `MainActivity` (pas de Compose, pas d'AppCompat). En debug, elle charge le serveur Vite du PC via `adb reverse`. En release, elle sert le build Vite depuis les assets via `WebViewAssetLoader`.

Aucun bridge JS dans cette phase : il arrive en phase 3, avec le GPS.

**Tech Stack:** Vite 8.3, React 19.3, TypeScript 7.0, Tailwind 4.3 (`@tailwindcss/vite`), MapLibre GL JS 6.9 (ESM only, imports nommés, WebGL2). Android Gradle Plugin 9.4.0 (Kotlin intégré), Gradle 9.7.1, JDK 21 (JBR), `androidx.webkit` 1.17.0.

**Spec:** `docs/mvp.md` (+ glossaire `CONTEXT.md`, décisions `docs/adr/`)

## Global Constraints

- Nom affiché de l'app : `Champi Map`. `applicationId` / `namespace` : `fr.champimap`. Dossier racine du dépôt : `X:\Dev\Perso\champibheu` (inchangé).
- Termes Minecraft (Chunk, Région, Claim) jamais visibles dans l'interface.
- Android : `minSdk = 26`, `compileSdk = 36`, `targetSdk = 36`, portrait verrouillé.
- Pas de Leaflet (ADR 0003). Pas de Jetpack Compose, pas d'AppCompat.
- Pas de tests automatisés pour le MVP. Vérification = `npm run typecheck`, build, puis contrôle sur le téléphone (capture adb).
- Source de carte : Plan IGN v2, détail max zoom 17. Mention « © IGN » minime (attribution compacte).
- MapLibre 6 : `import { Map as MapLibreMap } from 'maplibre-gl'`. **Pas** d'import par défaut.
- AGP 9 : **ne pas** appliquer `org.jetbrains.kotlin.android`, pas de bloc `kotlinOptions`.

## Environnement (constaté le 2026-09-15)

- Node 24.11.1 et npm 11.6.2 fonctionnent. **pnpm est cassé : utiliser npm.**
- `java` n'est pas dans le PATH, et le JBR d'Android Studio est corrompu. Utiliser `C:\Users\miste\.jdks\jbr-21.0.11`. Chaque commande Gradle dans Git Bash commence par `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`.
- SDK Android : `C:\Users\miste\AppData\Local\Android\Sdk`. Plateformes 36 et 37 et build-tools 36.0.0 installés. `ANDROID_HOME` non défini, d'où `local.properties`.
- Pas de Gradle installé : le wrapper est récupéré depuis le dépôt GitHub de Gradle (tag `v9.7.1`).
- Téléphone : Samsung SM-S731B, Android API 36, `adb devices` → `R5GYB08Q2NV device`.

## File Structure

```
/
├── .gitignore
├── CONTEXT.md, docs/                        (existants)
├── web/
│   ├── package.json                         scripts dev/build/typecheck/build:android
│   ├── vite.config.ts                       base './', serveur 127.0.0.1:5173
│   ├── tsconfig.json
│   ├── index.html                           viewport sans zoom navigateur
│   └── src/
│       ├── main.tsx                         montage React
│       ├── index.css                        Tailwind
│       ├── App.tsx                          layout plein écran
│       ├── components/MapView.tsx           cycle de vie de la carte MapLibre
│       └── map/ign.ts                       URL Plan IGN + style MapLibre + position de départ
└── android/
    ├── settings.gradle.kts, build.gradle.kts, gradle.properties, local.properties (ignoré)
    ├── gradlew, gradlew.bat, gradle/wrapper/{gradle-wrapper.jar, gradle-wrapper.properties}
    └── app/
        ├── build.gradle.kts                 WEB_URL par type de build
        └── src/
            ├── main/AndroidManifest.xml     INTERNET, portrait, activité unique
            ├── main/java/fr/champimap/MainActivity.kt
            ├── main/assets/web/             (généré par build:android, ignoré par git)
            └── debug/AndroidManifest.xml    autorise http://localhost en debug
```

---

### Task 1: Dépôt git

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Consumes: rien.
- Produces: un dépôt git initialisé contenant la doc existante.

- [ ] **Step 1: Initialiser git**

Run (Git Bash, depuis `X:/Dev/Perso/champibheu`) :
```bash
git init -b main
```
Expected: `Initialized empty Git repository in X:/Dev/Perso/champibheu/.git/`

- [ ] **Step 2: Créer `.gitignore`**

```gitignore
# web
web/node_modules/
web/dist/

# android
android/.gradle/
android/.kotlin/
android/build/
android/app/build/
android/local.properties
android/.idea/
*.iml
android/app/src/main/assets/web/

# os / éditeurs
.DS_Store
Thumbs.db
.vscode/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore CONTEXT.md docs
git commit -m "docs: glossaire, ADR et spec MVP de Champi Map"
```
Expected: le commit contient `CONTEXT.md`, `docs/mvp.md`, `docs/adr/0001…0003`, ce plan et `.gitignore`.

---

### Task 2: App web — carte Plan IGN plein écran

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.tsx`, `web/src/index.css`, `web/src/App.tsx`, `web/src/components/MapView.tsx`, `web/src/map/ign.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `npm run dev` → serveur sur `http://127.0.0.1:5173/` (utilisé par Task 3).
  - `npm run build:android` → écrit `android/app/src/main/assets/web/index.html` (utilisé par Task 4).
  - `web/src/map/ign.ts` exporte `PLAN_IGN_TILE_URL: string`, `MAX_DETAIL_ZOOM = 17`, `START_CENTER: [number, number]`, `START_ZOOM: number`, `ignStyle: StyleSpecification`. La phase 4 remplacera l'URL par celle du cache.

- [ ] **Step 1: Créer `web/package.json`**

```json
{
  "name": "champi-map-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit && vite build",
    "build:android": "tsc --noEmit && vite build --outDir ../android/app/src/main/assets/web --emptyOutDir"
  }
}
```

- [ ] **Step 2: Installer les dépendances**

Run :
```bash
cd web
npm install maplibre-gl@6.9.1 react@19.3.0 react-dom@19.3.0
npm install -D vite@8.3.0 @vitejs/plugin-react@6.1.1 typescript@7.0.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 @types/react@19.3.0 @types/react-dom@19.3.0
```
Expected: `package.json` contient `dependencies` et `devDependencies`, et `package-lock.json` est créé. Aucune erreur `ERESOLVE`. En cas de conflit de peer dependency entre Vite 8 et un plugin, relancer avec la dernière version du plugin (`npm view <plugin> version`) plutôt qu'avec `--force`.

- [ ] **Step 3: Créer `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : l'app est servie depuis /assets/web/ dans l'APK.
  base: './',
  plugins: [react(), tailwindcss()],
  // IPv4 explicite : adb reverse se connecte à 127.0.0.1.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
```

- [ ] **Step 4: Créer `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: Créer `web/index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Champi Map</title>
  </head>
  <body class="overscroll-none">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Créer `web/src/index.css`**

```css
@import "tailwindcss";

html,
body,
#root {
  height: 100%;
  margin: 0;
}
```

- [ ] **Step 7: Créer `web/src/map/ign.ts`**

```ts
import type { StyleSpecification } from 'maplibre-gl';

// Géoplateforme IGN, WMTS sans clé. Tuiles « non soumises à limite d'usage » (CGU art. 3.2).
export const PLAN_IGN_TILE_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

// Détail max imposé (docs/mvp.md). Au-delà, MapLibre agrandit le zoom 17 : flou mais jamais blanc.
export const MAX_DETAIL_ZOOM = 17;

// Forêt de Chaux, [longitude, latitude].
export const START_CENTER: [number, number] = [5.68, 47.08];
export const START_ZOOM = 12;

export const ignStyle: StyleSpecification = {
  version: 8,
  sources: {
    'plan-ign': {
      type: 'raster',
      tiles: [PLAN_IGN_TILE_URL],
      tileSize: 256,
      minzoom: 0,
      maxzoom: MAX_DETAIL_ZOOM,
      attribution: '© IGN – Plan IGN',
    },
  },
  layers: [
    // Fond visible là où aucune tuile n'est chargée.
    { id: 'background', type: 'background', paint: { 'background-color': '#ece9e1' } },
    { id: 'plan-ign', type: 'raster', source: 'plan-ign' },
  ],
};
```

- [ ] **Step 8: Créer `web/src/components/MapView.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ignStyle, START_CENTER, START_ZOOM } from '../map/ign';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: ignStyle,
      center: START_CENTER,
      zoom: START_ZOOM,
      maxZoom: 20,
      attributionControl: { compact: true },
    });
    // StrictMode monte l'effet deux fois en dev : on détruit proprement la carte.
    return () => map.remove();
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 9: Créer `web/src/App.tsx`**

```tsx
import { MapView } from './components/MapView';

export function App() {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView />
    </main>
  );
}
```

- [ ] **Step 10: Créer `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 11: Vérifier types et build**

Run :
```bash
cd web
npm run typecheck
npm run build
```
Expected: aucune erreur TypeScript. `vite build` affiche `✓ built in …` et crée `web/dist/index.html`, avec des chemins `./assets/…` dans le HTML (vérifier : `grep -o 'src="[^"]*"' dist/index.html` → `src="./assets/index-….js"`).

Si TypeScript 7 rejette une option de `tsconfig.json` (message `Option '…' has been removed`), supprimer uniquement cette option et relancer.

- [ ] **Step 12: Vérifier dans le navigateur du PC**

Run : `npm run dev` (en arrière-plan), puis ouvrir `http://127.0.0.1:5173/`.

Expected :
- carte Plan IGN centrée sur la Forêt de Chaux ;
- déplacement et zoom à la souris ;
- petit bouton ⓘ en bas à droite qui déplie « © IGN – Plan IGN » (il peut être déplié au chargement et se replier au premier déplacement : comportement normal) ;
- au-delà du zoom 17, l'image s'agrandit sans devenir blanche ;
- console du navigateur sans erreur.

Arrêter le serveur ensuite.

- [ ] **Step 13: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/tsconfig.json web/index.html web/src
git commit -m "feat(web): carte Plan IGN plein écran avec MapLibre"
```

---

### Task 3: App Android debug — WebView sur le serveur Vite

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/local.properties`, `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.jar`, `android/gradle/wrapper/gradle-wrapper.properties`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/debug/AndroidManifest.xml`, `android/app/src/main/java/fr/champimap/MainActivity.kt`

**Interfaces:**
- Consumes: `npm run dev` de Task 2, sur `http://127.0.0.1:5173/`.
- Produces:
  - `BuildConfig.WEB_URL: String` (`http://localhost:5173/` en debug, `https://appassets.androidplatform.net/assets/web/index.html` en release) ;
  - `MainActivity` avec un champ `webView: WebView` et un `WebViewClient` dont `shouldInterceptRequest` délègue à `WebViewAssetLoader`. La phase 4 y ajoutera l'interception des chunks.

- [ ] **Step 1: Récupérer le wrapper Gradle 9.7.1**

Run (depuis la racine du dépôt) :
```bash
mkdir -p android/gradle/wrapper
BASE=https://raw.githubusercontent.com/gradle/gradle/v9.7.1
curl -fsSL -o android/gradlew "$BASE/gradlew"
curl -fsSL -o android/gradlew.bat "$BASE/gradlew.bat"
curl -fsSL -o android/gradle/wrapper/gradle-wrapper.jar "$BASE/gradle/wrapper/gradle-wrapper.jar"
chmod +x android/gradlew
```
Expected: les trois fichiers existent, `gradle-wrapper.jar` pèse environ 40–50 KB.

- [ ] **Step 2: Créer `android/gradle/wrapper/gradle-wrapper.properties`**

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-9.7.1-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

- [ ] **Step 3: Créer `android/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "champi-map"
include(":app")
```

- [ ] **Step 4: Créer `android/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application") version "9.4.0" apply false
}
```

- [ ] **Step 5: Créer `android/gradle.properties`**

```properties
org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=true
```

- [ ] **Step 6: Créer `android/local.properties`** (ignoré par git)

```properties
sdk.dir=C\:\\Users\\miste\\AppData\\Local\\Android\\Sdk
```

- [ ] **Step 7: Créer `android/app/build.gradle.kts`**

```kotlin
plugins {
    // AGP 9 : Kotlin intégré, ne pas ajouter org.jetbrains.kotlin.android.
    id("com.android.application")
}

android {
    namespace = "fr.champimap"
    compileSdk = 36

    defaultConfig {
        applicationId = "fr.champimap"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // Serveur Vite du PC, exposé sur le téléphone par `adb reverse tcp:5173 tcp:5173`.
            buildConfigField("String", "WEB_URL", "\"http://localhost:5173/\"")
        }
        release {
            isMinifyEnabled = false
            // App perso installée à la main : signée avec la clé debug.
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("String", "WEB_URL", "\"https://appassets.androidplatform.net/assets/web/index.html\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
```

- [ ] **Step 8: Créer `android/app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="Champi Map"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 9: Créer `android/app/src/debug/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Debug uniquement : le serveur Vite est en http://localhost. -->
    <application android:usesCleartextTraffic="true" />
</manifest>
```

- [ ] **Step 10: Créer `android/app/src/main/java/fr/champimap/MainActivity.kt`**

```kotlin
package fr.champimap

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // chrome://inspect sur le PC en debug.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Release : sert assets/web/ sur https://appassets.androidplatform.net/assets/web/.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
        }
        setContentView(webView)
        webView.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
```

- [ ] **Step 11: Compiler l'APK debug**

Run :
```bash
cd android
export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11"
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`, et `android/app/build/outputs/apk/debug/app-debug.apk` existe. Le premier lancement télécharge Gradle et AGP (plusieurs minutes). Pas de timeout court : lancer en arrière-plan si besoin.

Si Gradle signale que 9.7.1 n'est pas supporté par AGP 9.4.0, remplacer `9.7.1` par `9.6.0` dans `gradle-wrapper.properties` (et dans l'URL du Step 1) puis relancer.

- [ ] **Step 12: Lancer sur le téléphone avec le serveur Vite**

Run :
```bash
cd web && npm run dev          # en arrière-plan
adb reverse tcp:5173 tcp:5173
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n fr.champimap/.MainActivity
```
Attendre ~5 s, puis :
```bash
adb exec-out screencap -p > "$TEMP/champi-debug.png"
```
Expected, en lisant la capture : carte Plan IGN plein écran sur la Forêt de Chaux, pas de page d'erreur « Webpage not available », pas de barre d'action.

- [ ] **Step 13: Vérifier le rechargement à chaud**

Modifier temporairement `START_ZOOM` à `14` dans `web/src/map/ign.ts` et enregistrer. Attendre ~3 s, reprendre une capture : la carte doit être plus zoomée sans réinstaller l'APK. **Remettre `START_ZOOM = 12`.**

- [ ] **Step 14: Commit**

```bash
git add android/settings.gradle.kts android/build.gradle.kts android/gradle.properties android/gradlew android/gradlew.bat android/gradle android/app/build.gradle.kts android/app/src
git commit -m "feat(android): WebView debug branchée sur le serveur Vite"
```
Expected: `android/local.properties` et `android/app/build/` absents du commit (`git status` propre).

---

### Task 4: Build release — app web embarquée, démarrage en mode avion

**Files:**
- Modify: aucun fichier source. Utilise `web` `build:android` (Task 2) et `BuildConfig.WEB_URL` release (Task 3).

**Interfaces:**
- Consumes: `npm run build:android` → `android/app/src/main/assets/web/index.html`, et `WebViewAssetLoader` de `MainActivity`.
- Produces: `android/app/build/outputs/apk/release/app-release.apk`, qui démarre sans réseau.

- [ ] **Step 1: Générer l'app web dans les assets**

Run :
```bash
cd web
npm run build:android
```
Expected: `android/app/src/main/assets/web/index.html` et `android/app/src/main/assets/web/assets/*.js|*.css` existent.

- [ ] **Step 2: Compiler et installer l'APK release**

Run :
```bash
cd android
export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11"
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```
Expected: `BUILD SUCCESSFUL`, puis `Success` à l'installation. Si l'installation échoue sur un conflit de signature, faire `adb uninstall fr.champimap` puis réinstaller.

- [ ] **Step 3: Vérifier en ligne**

Arrêter le serveur Vite s'il tourne (pour prouver que l'APK ne dépend plus du PC), puis :
```bash
adb reverse --remove-all
adb shell am force-stop fr.champimap
adb shell am start -n fr.champimap/.MainActivity
adb exec-out screencap -p > "$TEMP/champi-release-online.png"
```
Expected: carte Plan IGN affichée, identique au debug.

- [ ] **Step 4: Vérifier en mode avion**

```bash
adb shell cmd connectivity airplane-mode enable
adb shell am force-stop fr.champimap
adb shell am start -n fr.champimap/.MainActivity
adb exec-out screencap -p > "$TEMP/champi-release-airplane.png"
adb shell cmd connectivity airplane-mode disable
```
Expected: l'app s'ouvre sans page d'erreur WebView. On voit le fond beige `#ece9e1` (pas de tuiles : le cache arrive en phase 4), avec d'éventuels restes de tuiles du cache HTTP de la WebView, et le bouton ⓘ. Si la commande `airplane-mode` est refusée, demander à l'utilisateur d'activer le mode avion à la main.

- [ ] **Step 5: Commit**

Rien de nouveau à versionner : les assets générés sont ignorés. Vérifier :
```bash
git status --short
```
Expected: sortie vide. Si `android/app/src/main/assets/web/` apparaît, corriger `.gitignore`, puis :
```bash
git add .gitignore
git commit -m "chore: ignorer le build web embarqué"
```

---

## Hors de cette phase (plans suivants)

Une phase = un plan, à écrire quand la phase précédente fonctionne sur le téléphone :
2. Waypoints locaux
3. Position + bridge (et faux bridge navigateur)
4. Cache (interception chunks + SQLite)
5. Claims
6. Supabase
7. Boussole
