module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@web/(.*)$": "<rootDir>/../frontend/src/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
