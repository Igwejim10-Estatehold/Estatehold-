# Estatehold Android build

Capacitor app settings:

- App name: Estatehold
- Application ID: `com.estatehold.app`
- Web domain: `https://estatehold-property-platform.replit.app`

The wrapper loads the Estatehold production domain, so it requires an internet connection and serves the current website content. The domain must remain available for the app to work.

## Build an unsigned AAB with GitHub Actions

The workflow builds an unsigned release bundle on every push and pull request, and can also be run manually:

1. Push a branch or open a pull request, or open the repository’s **Actions** tab and run **Build unsigned Android AAB**.
2. Wait for the `build-unsigned-aab` job to finish successfully.
3. Open that workflow run and download the `estatehold-unsigned-aab` artifact. It contains:

   ```text
   app-release.aab
   ```

The workflow installs Temurin Java 17 and Android SDK Platform 35 / Build Tools 35.0.0, installs the workspace dependencies, and runs:

```sh
pnpm --filter @workspace/estatehold run android:bundle
```

This CI bundle is deliberately **unsigned**: no signing key or password is needed or used. It is for build verification and testing; Google Play requires a signed AAB, and an AAB is not directly installable like an APK. The downloaded artifact is retained by GitHub Actions for 14 days.

## Sign a bundle for Play Store later

When ready to publish, build on a trusted computer with Android Studio, Android SDK Platform 35 (or the version required by `android/variables.gradle`), Android SDK Build Tools, and JDK 17 or newer.

1. Create an upload keystore in a private location. Keep the password and keystore backed up securely:

   ```sh
   cd artifacts/estatehold/android
   keytool -genkeypair -v -keystore estatehold-upload-key.jks \
     -alias estatehold -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copy `key.properties.example` to `key.properties`. Set `storeFile` to the keystore filename/path and fill in your passwords and alias. Keep both files private; they are excluded from Git.
3. From the repository root, run `pnpm --filter @workspace/estatehold run android:bundle`. With `key.properties` configured, Gradle signs the release AAB.
4. The bundle is written to `artifacts/estatehold/android/app/build/outputs/bundle/release/app-release.aab`. Upload it to Google Play Console **Internal testing** when ready. Preserve the same keystore and alias for every future release; losing the upload key can prevent updates.

To open the project in Android Studio, run `pnpm --filter @workspace/estatehold run android:sync`, then open `artifacts/estatehold/android`. Configure the local `key.properties` before creating a signed release bundle.
