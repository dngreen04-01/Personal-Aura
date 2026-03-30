const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
const firebaseAuth = require('firebase/auth');
const AppleAuth = require('expo-apple-authentication');

const {
  configureGoogleSignIn,
  signInWithGoogle,
  signInWithApple,
  signOut,
  signIn,
  signUp,
  getIdToken,
} = require('../../lib/auth');

beforeEach(() => {
  jest.clearAllMocks();
  // Reset default mock implementations
  GoogleSignin.signIn.mockResolvedValue({ data: { idToken: 'mock-google-id-token' } });
  GoogleSignin.hasPlayServices.mockResolvedValue(true);
  GoogleSignin.signOut.mockResolvedValue(null);
  firebaseAuth.signInWithCredential.mockResolvedValue({ user: { uid: 'test-uid', displayName: 'Test' } });
  AppleAuth.signInAsync.mockResolvedValue({
    identityToken: 'mock-apple-identity-token',
    fullName: { givenName: 'Test', familyName: 'User' },
  });
});

describe('configureGoogleSignIn', () => {
  it('calls GoogleSignin.configure with webClientId from env', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'test-web-client-id';
    configureGoogleSignIn();
    expect(GoogleSignin.configure).toHaveBeenCalledWith({ webClientId: 'test-web-client-id' });
  });

  it('warns if webClientId is not set', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    configureGoogleSignIn();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'));
    warnSpy.mockRestore();
  });
});

describe('signInWithGoogle', () => {
  it('returns Firebase user on success', async () => {
    const user = await signInWithGoogle();
    expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
    expect(GoogleSignin.signIn).toHaveBeenCalled();
    expect(firebaseAuth.GoogleAuthProvider.credential).toHaveBeenCalledWith('mock-google-id-token');
    expect(firebaseAuth.signInWithCredential).toHaveBeenCalled();
    expect(user.uid).toBe('test-uid');
  });

  it('throws when no idToken returned', async () => {
    GoogleSignin.signIn.mockResolvedValueOnce({ data: { idToken: null } });
    await expect(signInWithGoogle()).rejects.toThrow('no ID token');
  });

  it('propagates SIGN_IN_CANCELLED error', async () => {
    const err = new Error('cancelled');
    err.code = statusCodes.SIGN_IN_CANCELLED;
    GoogleSignin.signIn.mockRejectedValueOnce(err);
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'SIGN_IN_CANCELLED' });
  });

  it('propagates PLAY_SERVICES_NOT_AVAILABLE error', async () => {
    const err = new Error('no play services');
    err.code = statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
    GoogleSignin.hasPlayServices.mockRejectedValueOnce(err);
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
  });

  it('propagates account collision error from Firebase', async () => {
    const err = new Error('collision');
    err.code = 'auth/account-exists-with-different-credential';
    firebaseAuth.signInWithCredential.mockRejectedValueOnce(err);
    await expect(signInWithGoogle()).rejects.toMatchObject({
      code: 'auth/account-exists-with-different-credential',
    });
  });
});

describe('signInWithApple', () => {
  it('returns Firebase user on success with name', async () => {
    const user = await signInWithApple();
    expect(firebaseAuth.signInWithCredential).toHaveBeenCalled();
    expect(firebaseAuth.updateProfile).toHaveBeenCalledWith(
      expect.anything(),
      { displayName: 'Test User' }
    );
    expect(user.uid).toBe('test-uid');
  });

  it('skips updateProfile when fullName is hidden', async () => {
    AppleAuth.signInAsync.mockResolvedValueOnce({
      identityToken: 'mock-token',
      fullName: { givenName: null, familyName: null },
    });
    await signInWithApple();
    expect(firebaseAuth.updateProfile).not.toHaveBeenCalled();
  });

  it('propagates ERR_REQUEST_CANCELED', async () => {
    const err = new Error('cancelled');
    err.code = 'ERR_REQUEST_CANCELED';
    AppleAuth.signInAsync.mockRejectedValueOnce(err);
    await expect(signInWithApple()).rejects.toMatchObject({ code: 'ERR_REQUEST_CANCELED' });
  });

  it('throws when no identity token returned', async () => {
    AppleAuth.signInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    });
    await expect(signInWithApple()).rejects.toThrow('no identity token');
  });

  it('propagates account collision error', async () => {
    const err = new Error('collision');
    err.code = 'auth/account-exists-with-different-credential';
    firebaseAuth.signInWithCredential.mockRejectedValueOnce(err);
    await expect(signInWithApple()).rejects.toMatchObject({
      code: 'auth/account-exists-with-different-credential',
    });
  });
});

describe('signOut', () => {
  it('calls both GoogleSignin.signOut and Firebase signOut', async () => {
    await signOut();
    expect(GoogleSignin.signOut).toHaveBeenCalled();
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });

  it('still calls Firebase signOut even if Google signOut fails', async () => {
    GoogleSignin.signOut.mockRejectedValueOnce(new Error('not signed in with google'));
    await signOut();
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });
});

describe('signIn (email/password)', () => {
  it('returns Firebase user', async () => {
    firebaseAuth.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'email-uid' },
    });
    const user = await signIn('test@test.com', 'password');
    expect(user.uid).toBe('email-uid');
  });
});

describe('signUp (email/password)', () => {
  it('creates user and sets displayName', async () => {
    firebaseAuth.createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'new-uid' },
    });
    const user = await signUp('test@test.com', 'password', 'Test Name');
    expect(firebaseAuth.updateProfile).toHaveBeenCalledWith(
      { uid: 'new-uid' },
      { displayName: 'Test Name' }
    );
    expect(user.uid).toBe('new-uid');
  });

  it('skips updateProfile if no displayName', async () => {
    firebaseAuth.createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'new-uid' },
    });
    await signUp('test@test.com', 'password');
    expect(firebaseAuth.updateProfile).not.toHaveBeenCalled();
  });
});

describe('getIdToken', () => {
  it('returns token when user is logged in', async () => {
    const token = await getIdToken();
    expect(token).toBe('mock-token');
  });
});
