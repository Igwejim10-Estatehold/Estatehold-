# Estatehold Android build

Capacitor app settings:

- App name: Estatehold
- Application ID: `com.estatehold.app`
- Web domain: `https://estatehold-property-platform.replit.app`

The wrapper loads the Estatehold production domain, so it requires an internet connection and serves the current website content. The domain must remain available for the app to work.

## Build a signed Play Store AAB

Use a computer with Android Studio installed, Android SDK Platform 35 (or the version required by `android/variables.gradle`), Android SDK Build Tools, and JDK 17 or newer.

1. Create an upload keystore in a private location. Keep the password and keystore backed up securely:

   ```sh
   cd artifacts/estatehold/android
   keytool -genkeypair -v -keystore estatehold-upload-key.jks \
     -alias estatehold -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copy `key.properties.example` to `key.properties`. Set `storeFile` to the keystore filename/path and fill in your passwords and alias. Keep both files private; they are excluded from Git.

3. From the repository root, build the web assets, sync Capacitor, and create the release bundle:

   ```sh
   pnpm --filter @workspace/estatehold run android:bundle
   ```

4. The signed Play Store bundle will be at:

   ```text
   artifacts/estatehold/android/app/build/outputs/bundle/release/app-release.aab
   ```

5. Upload that AAB to the app’s Google Play Console **Internal testing** track. Preserve the same keystore and alias for every future release; losing the upload key can prevent updates.

## Android Studio

Run `pnpm --filter @workspace/estatehold run android:sync`, then open `artifacts/estatehold/android` in Android Studio. Configure the same local `key.properties` before building the release bundle.

The Replit build workspace does not include the Android SDK. It can create and sync the native project, but the signed AAB must be built on a machine with the SDK and your private upload keystore.
