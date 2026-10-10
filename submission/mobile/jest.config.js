module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@web/(.*)$": "<rootDir>/../frontend/src/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
