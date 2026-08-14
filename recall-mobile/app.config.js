const isDev = process.env.NODE_ENV !== 'production';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Recall',
  slug: 'recall-mobile',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  scheme: 'recall',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.recall.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#000000',
    },
    package: 'com.recall.app',
    usesCleartextTraffic: isDev,
    intentFilters: [],
  },
};
