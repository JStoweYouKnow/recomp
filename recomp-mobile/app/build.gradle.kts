import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

fun localProp(key: String): String {
    val props = Properties()
    rootProject.file("local.properties").inputStream().use { props.load(it) }
    return props.getProperty(key, "")
}

android {
    namespace = "com.refactor.app"
    compileSdk = 35

    signingConfigs {
        create("release") {
            storeFile = rootProject.file(localProp("KEYSTORE_PATH"))
            storePassword = localProp("KEY_STORE_PASSWORD")
            keyAlias = localProp("KEY_ALIAS")
            keyPassword = localProp("KEY_PASSWORD")
        }
    }

    defaultConfig {
        applicationId = "com.refactor.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 33
        versionName = "4.8"
        // Optional: set in `gradle.properties` to enable FCM (`FirebaseMessaging`). Leave empty for CI/local without Firebase.
        val fbAppId = (project.findProperty("FIREBASE_APP_ID") as String?) ?: ""
        val fbApiKey = (project.findProperty("FIREBASE_API_KEY") as String?) ?: ""
        val fbProjectId = (project.findProperty("FIREBASE_PROJECT_ID") as String?) ?: ""
        val playSubscriptionId = (project.findProperty("PLAY_SUBSCRIPTION_ID") as String?) ?: ""
        buildConfigField("String", "FIREBASE_APP_ID", "\"$fbAppId\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"$fbApiKey\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"$fbProjectId\"")
        buildConfigField("String", "PLAY_SUBSCRIPTION_ID", "\"$playSubscriptionId\"")
    }

    buildTypes {
        debug {
            // Use production API for real-device testing. Change to http://10.0.2.2:3000 for emulator + local server.
            buildConfigField("String", "API_BASE_URL", "\"https://refactor-one.vercel.app\"")
            buildConfigField("String", "ENVIRONMENT", "\"development\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            ndk {
                debugSymbolLevel = "FULL"
            }
            buildConfigField("String", "API_BASE_URL", "\"https://refactor-one.vercel.app\"")
            buildConfigField("String", "ENVIRONMENT", "\"production\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    val ktor = "3.0.3"
    implementation("io.ktor:ktor-client-android:$ktor")
    implementation("io.ktor:ktor-client-content-negotiation:$ktor")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktor")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    val room = "2.6.1"
    implementation("androidx.room:room-runtime:$room")
    implementation("androidx.room:room-ktx:$room")
    ksp("androidx.room:room-compiler:$room")

    implementation("androidx.work:work-runtime-ktx:2.9.1")

    val firebaseBom = platform("com.google.firebase:firebase-bom:33.7.0")
    implementation(firebaseBom)
    implementation("com.google.firebase:firebase-messaging")

    implementation("io.coil-kt:coil-compose:2.7.0")

    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    implementation("com.android.billingclient:billing-ktx:7.1.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
