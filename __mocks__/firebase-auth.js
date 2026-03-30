module.exports = {
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: { credential: jest.fn().mockReturnValue('mock-google-credential') },
  OAuthProvider: jest.fn().mockImplementation(() => ({
    credential: jest.fn().mockReturnValue('mock-apple-credential'),
  })),
  signInWithCredential: jest.fn().mockResolvedValue({ user: { uid: 'test-uid', displayName: 'Test' } }),
};
