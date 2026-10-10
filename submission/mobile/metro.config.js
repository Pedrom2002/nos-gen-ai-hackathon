const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The shared web modules live outside the app folder (see babel.config.js).
config.watchFolders = [path.resolve(__dirname, "../frontend/src")];
module.exports = config;
