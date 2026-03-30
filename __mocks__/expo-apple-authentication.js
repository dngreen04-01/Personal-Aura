const AppleAuthenticationScope = {
  FULL_NAME: 0,
  EMAIL: 1,
};

const signInAsync = jest.fn().mockResolvedValue({
  identityToken: 'mock-apple-identity-token',
  fullName: { givenName: 'Test', familyName: 'User' },
});

module.exports = { signInAsync, AppleAuthenticationScope };
