module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@api': './src/api',
            '@auth': './src/auth',
            '@screens': './src/screens',
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@theme': './src/theme',
            '@types': './src/types',
            '@lib': './src/lib',
          },
        },
      ],
    ],
  };
};
