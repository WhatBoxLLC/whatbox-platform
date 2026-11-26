// Expo detects the npm workspace automatically; packages/core is compiled from source.
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
