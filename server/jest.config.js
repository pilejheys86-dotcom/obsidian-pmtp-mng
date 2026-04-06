module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['./__tests__/setup.js'],
  testTimeout: 15000,
  clearMocks: false,
  restoreMocks: false,
};
