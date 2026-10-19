const { getDefaultConfig } = require('expo/metro-config');

const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo SQLite web (.wasm) desteği
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  tslib: path.resolve(__dirname, 'src/utils/tslib-compat.js'),
};

module.exports = config;
