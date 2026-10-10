const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The shared web modules live outside the app folder (see babel.config.js).
config.watchFolders = [path.resolve(__dirname, "../frontend/src")];
// Their imports (and the Babel helpers added when compiling them) resolve
// from this app's node_modules, whether or not the web app is installed.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
