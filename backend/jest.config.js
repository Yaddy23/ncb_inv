module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js'
  ],
  verbose: true,
  maxWorkers: 1,
  transformIgnorePatterns: [
    '/node_modules/(?!(otplib|@otplib|@noble|@scure)/)'
  ],
};