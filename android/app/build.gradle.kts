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
            // Origine figée : elle porte les données locales (IndexedDB) de la build debug.
            buildConfigField("String", "WEB_ORIGIN", "\"http://localhost:5173\"")
        }
        release {
            isMinifyEnabled = false
            // App perso installée à la main : signée avec la clé debug.
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("String", "WEB_URL", "\"https://appassets.androidplatform.net/assets/web/index.html\"")
            buildConfigField("String", "WEB_ORIGIN", "\"https://appassets.androidplatform.net\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.activity:activity:1.13.0")
    implementation("com.google.android.gms:play-services-location:21.4.0")
}

// Une release sans app web embarquée afficherait une page blanche.
val embeddedWebIndex = file("src/main/assets/web/index.html")
tasks.configureEach {
    if (name == "mergeReleaseAssets") {
        doFirst {
            check(embeddedWebIndex.exists()) { "App web absente : lancer `npm run build:android` dans web/ avant la release." }
        }
    }
}
