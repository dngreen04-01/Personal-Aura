module.exports = {
  testEnvironment: 'node',
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
    '^firebase/auth$': '<rootDir>/__mocks__/firebase-auth.js',
    '^\\.?\\.?/?(?:lib/)?firebase$': '<rootDir>/__mocks__/firebase.js',
  },
};
