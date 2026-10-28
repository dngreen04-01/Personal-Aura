const unit = {
  displayName: 'unit',
  testEnvironment: 'node',
  resetModules: true,
  testPathIgnorePatterns: ['/node_modules/', '/__helpers__/', '<rootDir>/__tests__/native/'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|firebase|@react-native-google-signin/.*)',
  ],
  moduleNameMapper: {
    '^@react-native-google-signin/google-signin$': '<rootDir>/__mocks__/@react-native-google-signin/google-signin.js',
    '^expo-apple-authentication$': '<rootDir>/__mocks__/expo-apple-authentication.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
    '^firebase/auth$': '<rootDir>/__mocks__/firebase-auth.js',
    '^\\.?\\.?/?(?:lib/)?firebase$': '<rootDir>/__mocks__/firebase.js',
  },
};

// Screens, hooks and notification code need the real React Native runtime, so
// they run under the jest-expo preset instead of the stubbed react-native above.
const native = {
  displayName: 'native',
  preset: 'jest-expo',
  // Keep the repo-root __mocks__ (which stub react-native for the unit
  // project) out of this project's module registry.
  roots: ['<rootDir>/__tests__/native'],
  testMatch: ['<rootDir>/__tests__/native/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/native/setup.js'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
  },
};

module.exports = {
  projects: [unit, native],
};
