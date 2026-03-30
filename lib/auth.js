import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from './firebase';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Call once at app init (app/_layout.js) before any sign-in attempt
export function configureGoogleSignIn() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    console.warn('[Auth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set. Google Sign-In will fail.');
  }
  GoogleSignin.configure({ webClientId });
}

export async function signUp(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// Returns Firebase user on success, null if user cancelled
export async function signInWithGoogle() {
  console.log('[Auth] Google sign-in initiated');
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error('Google Sign-In failed: no ID token received');
  }
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  console.log('[Auth] Google sign-in successful, uid:', result.user.uid);
  return result.user;
}

// Returns Firebase user on success, null if user cancelled
export async function signInWithApple() {
  console.log('[Auth] Apple sign-in initiated');

  // Generate nonce for replay attack prevention
  const rawNonce = Array.from(
    Crypto.getRandomValues(new Uint8Array(32))
  ).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const { identityToken, fullName } = appleCredential;
  if (!identityToken) {
    throw new Error('Apple Sign-In failed: no identity token received');
  }

  const provider = new OAuthProvider('apple.com');
  const oauthCredential = provider.credential({
    idToken: identityToken,
    rawNonce,
  });
  const result = await signInWithCredential(auth, oauthCredential);

  // Apple only provides name on first sign-in, set it if available
  if (fullName?.givenName) {
    const displayName = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ');
    await updateProfile(result.user, { displayName });
  }

  console.log('[Auth] Apple sign-in successful, uid:', result.user.uid);
  return result.user;
}

export async function signOut() {
  // Clear Google native session to allow account picker on next sign-in
  try {
    await GoogleSignin.signOut();
  } catch {
    // Google signOut can fail if user didn't sign in with Google. That's fine.
  }
  await firebaseSignOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// Re-export for error handling in UI layer
export { statusCodes } from '@react-native-google-signin/google-signin';
