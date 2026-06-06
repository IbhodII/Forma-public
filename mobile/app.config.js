/**
 * Expo / EAS (bare React Native). После `eas login` → `npm run eas:configure`.
 * @type {import('expo/config').ExpoConfig}
 */
module.exports = {
  name: 'FormaApp',
  displayName: 'Forma',
  icon: './assets/icon.png',
  slug: 'myhealthdashboard',
  owner: 'ibhodi',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'myhealthdashboard',
  plugins: ['expo-asset', 'expo-font', 'expo-background-task'],
  android: {
    package: 'com.myhealthdashboard.app',
    versionCode: 2,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          {scheme: 'myhealthdashboard', host: 'oauth', pathPrefix: '/yandex'},
          {scheme: 'myhealthdashboard', host: 'oauth', pathPrefix: '/google'},
          {scheme: 'myhealthdashboard', host: 'auth', pathPrefix: '/login'},
        ],
      },
    ],
  },
  extra: {
    eas: {
      projectId: '2f498565-e742-4ae6-8b86-10caabae0960',
    },
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE || '',
    apiBaseUrlLocal: process.env.EXPO_PUBLIC_API_BASE_URL_LOCAL || '',
    apiBaseUrlTailscale: process.env.EXPO_PUBLIC_API_BASE_URL_TAILSCALE || '',
    cloudOAuth: {
      yandexClientId: process.env.EXPO_PUBLIC_YANDEX_CLIENT_ID || '',
      yandexRedirectUri: process.env.EXPO_PUBLIC_YANDEX_REDIRECT_URI || '',
      googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
      googleAndroidRedirectScheme:
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_REDIRECT_SCHEME || '',
    },
  },
};

if (!process.env.EXPO_PUBLIC_YANDEX_CLIENT_ID) {
  console.warn(
    '[Forma] EXPO_PUBLIC_YANDEX_CLIENT_ID is empty — Yandex login buttons will be disabled in release APK. ' +
      'Set mobile/.env before npm run android:release. Redirect: myhealthdashboard://oauth/yandex',
  );
}

if (
  process.env.EXPO_PUBLIC_YANDEX_REDIRECT_URI &&
  process.env.EXPO_PUBLIC_YANDEX_REDIRECT_URI !== 'myhealthdashboard://oauth/yandex'
) {
  console.warn(
    '[Forma] EXPO_PUBLIC_YANDEX_REDIRECT_URI differs from default. ' +
      'Ensure it is registered in oauth.yandex.ru and supported by android.intentFilters.',
  );
}
