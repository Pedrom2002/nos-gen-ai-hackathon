// "@web" is the web frontend's src: its pure modules (masking, review
// history, API model, i18n) are shared with the app instead of copied.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["module-resolver", { alias: { "@web": "../frontend/src", "@": "./src" } }]],
  };
};
