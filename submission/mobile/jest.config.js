const path = require("path");

module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  // The shared web files live in ../frontend; once compiled they need
  // packages (Babel helpers) that only this app installs.
  moduleDirectories: ["node_modules", path.join(__dirname, "node_modules")],
  moduleNameMapper: {
    "^@web/(.*)$": "<rootDir>/../frontend/src/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
