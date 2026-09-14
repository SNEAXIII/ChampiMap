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
