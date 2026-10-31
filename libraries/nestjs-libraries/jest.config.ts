/**
 * Run with:  pnpm exec jest -c libraries/nestjs-libraries/jest.config.ts
 */
export default {
  displayName: 'nestjs-libraries',
  testEnvironment: 'node',
  rootDir: '../..',
  roots: ['<rootDir>/libraries/nestjs-libraries/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: { allowJs: true, module: 'commonjs', target: 'es2019' },
        isolatedModules: true,
        diagnostics: false,
      },
    ],
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/libraries/nestjs-libraries/tsconfig.lib.json',
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  // nostr-tools depends on ESM only packages (@noble/*, @scure/*)
  transformIgnorePatterns: ['/node_modules/(?!.*(?:@noble|@scure))'],
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  },
};
