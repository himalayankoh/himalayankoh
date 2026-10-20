# Himalayan Koh Admin — Android Application

Native Android wrapper application for the Himalayan Koh Admin Panel (`com.himalayankoh.admin`).

---

## Features

- **Direct Native Experience**: Runs `https://himalayankoh.com/admin` in an optimized hardware-accelerated WebView.
- **Session Persistence**: Complete cookie management ensures login stays authenticated across app closes and restarts.
- **Hardware Back Navigation**: Intercepts Android device back-button gestures to seamlessly navigate back through admin views.
- **Pull-To-Refresh**: Native `SwipeRefreshLayout` styled in Himalayan Koh deep navy `#0B0E17` and blue/violet accents.
- **File & Camera Attachments**: Fully wired `WebChromeClient.onShowFileChooser` allowing file uploads and camera snapshots for the Gmail-style Reply Composer and product image uploads.
- **Deep Navy Aesthetic**: Native status bar, splash container, and window backgrounds match the mobile admin design system.
- **Offline Fallback**: Clean offline notice with a retry trigger if connectivity is interrupted.

---

## How to Download the APK

### 1. From GitHub Actions (Automated Builds)
1. Go to the active repository on GitHub:
   `https://github.com/himalayankoh/himalayankoh/actions`
2. Select the workflow: **"Build Android APK (Himalayan Koh Admin)"**.
3. Click the latest successful run.
4. Under the **Artifacts** section at the bottom, click **`HimalayanKoh-Admin-APK`** to download the ZIP file.
5. Extract the ZIP to obtain `HimalayanKoh-Admin-v1.0.0-debug.apk`.
6. Transfer or download directly to your Android device and tap to install!

### 2. Manual Trigger
1. In the **Actions** tab on GitHub, click **"Build Android APK (Himalayan Koh Admin)"**.
2. Click **Run workflow**, choose branch (`integration/cloudflare-workers-migration` or `main`), select build type (`debug`), and click **Run workflow**.
3. In ~2 minutes, the fresh `.apk` is built and ready to download in Artifacts.

---

## Local Development & Build

### Prerequisites
- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17
- Android SDK Platform 34

### Building with Gradle Command Line
```bash
cd android
./gradlew assembleDebug
```
The compiled APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

To install directly to a connected Android phone or emulator via ADB:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
