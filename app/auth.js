import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../lib/theme';
import {
  signIn, signUp, resetPassword,
  signInWithGoogle, signInWithApple,
  statusCodes,
} from '../lib/auth';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        await resetPassword(email.trim());
        setResetSent(true);
        setLoading(false);
        return;
      }

      if (mode === 'signup') {
        await signUp(email.trim(), password, displayName.trim());
      } else {
        await signIn(email.trim(), password);
      }
      // Auth state listener in AuthProvider will handle navigation
    } catch (err) {
      setError(getErrorMessage(err.code));
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      // Auth state listener in AuthProvider will handle navigation
    } catch (err) {
      // User cancelled — return silently
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (err.code === statusCodes.IN_PROGRESS) return;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services required for Google Sign-In. Use email instead.');
        return;
      }
      if (err.code === statusCodes.SIGN_IN_REQUIRED || err.message?.includes('DEVELOPER_ERROR')) {
        console.warn('[Auth] Google Sign-In config error:', err);
        setError('Google Sign-In configuration error. Please contact support.');
        return;
      }
      if (err.code === 'auth/account-exists-with-different-credential') {
        setError('An account with this email already exists. Sign in with your original method.');
        return;
      }
      console.warn('[Auth] Google sign-in failed:', err.code || err.message);
      setError(getErrorMessage(err.code) || 'Google Sign-In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithApple();
      // Auth state listener in AuthProvider will handle navigation
    } catch (err) {
      if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') return;
      if (err.code === 'ERR_REQUEST_FAILED') {
        setError('Apple Sign-In unavailable. Try again or use email.');
        return;
      }
      if (err.code === 'auth/account-exists-with-different-credential') {
        setError('An account with this email already exists. Sign in with your original method.');
        return;
      }
      console.warn('[Auth] Apple sign-in failed:', err.code || err.message);
      setError(getErrorMessage(err.code) || 'Apple Sign-In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = () => {
    if (mode === 'reset') return email.trim().length > 0;
    if (mode === 'signup') return email.trim().length > 0 && password.length >= 6 && displayName.trim().length > 0;
    return email.trim().length > 0 && password.length >= 6;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <MaterialIcons name="bolt" size={32} color={colors.bgDark} />
            </View>
            <Text style={styles.logoText}>Aura</Text>
            <Text style={styles.tagline}>AI-Powered Fitness Coaching</Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>
              {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
            </Text>

            {/* Social auth buttons (shown in both signin and signup modes) */}
            {mode !== 'reset' && (
              <>
                <TouchableOpacity
                  style={[styles.socialButton, styles.googleButton]}
                  onPress={handleGoogleSignIn}
                  disabled={loading}
                  accessibilityLabel="Sign in with Google"
                  accessibilityRole="button"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <>
                      <Text style={styles.googleIcon}>G</Text>
                      <Text style={styles.socialButtonText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Apple Sign-In: requires Apple Developer account. Uncomment when ready. */}
                {false && Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.socialButton, styles.appleButton]}
                    onPress={handleAppleSignIn}
                    disabled={loading}
                    accessibilityLabel="Sign in with Apple"
                    accessibilityRole="button"
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.bgDark} />
                    ) : (
                      <>
                        <MaterialIcons name="apple" size={20} color={colors.bgDark} />
                        <Text style={[styles.socialButtonText, { color: colors.bgDark }]}>
                          Continue with Apple
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            {mode === 'reset' && resetSent ? (
              <View style={styles.successCard}>
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
                <Text style={styles.successText}>
                  Password reset email sent. Check your inbox.
                </Text>
                <TouchableOpacity onPress={() => { setMode('signin'); setResetSent(false); }}>
                  <Text style={styles.linkText}>Back to sign in</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {mode === 'signup' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>NAME</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your name"
                      placeholderTextColor={colors.textMuted}
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                      autoComplete="name"
                    />
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>

                {mode !== 'reset' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>PASSWORD</Text>
                    <View style={styles.passwordRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="Min 6 characters"
                        placeholderTextColor={colors.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      />
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <MaterialIcons
                          name={showPassword ? 'visibility-off' : 'visibility'}
                          size={20}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {error && (
                  <View style={styles.errorCard}>
                    <MaterialIcons name="error-outline" size={18} color="#ff6b6b" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitButton, !canSubmit() && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit() || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.bgDark} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
                    </Text>
                  )}
                </TouchableOpacity>

                {mode === 'signin' && (
                  <TouchableOpacity onPress={() => { setMode('reset'); setError(null); }}>
                    <Text style={styles.linkText}>Forgot password?</Text>
                  </TouchableOpacity>
                )}

                {mode === 'reset' && (
                  <TouchableOpacity onPress={() => { setMode('signin'); setError(null); }}>
                    <Text style={styles.linkText}>Back to sign in</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Toggle Sign In / Sign Up */}
          {mode !== 'reset' && (
            <View style={styles.toggleSection}>
              <Text style={styles.toggleText}>
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
              }}>
                <Text style={styles.toggleLink}>
                  {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists. Sign in with your original method.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: 32,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  formSection: {
    gap: spacing.md,
  },
  formTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  // Social auth buttons
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: 14,
    borderWidth: 1,
  },
  googleButton: {
    backgroundColor: 'transparent',
    borderColor: colors.borderLight,
  },
  appleButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  googleIcon: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  socialButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textMuted,
  },
  // Existing styles
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#ff6b6b',
  },
  successCard: {
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  successText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
  },
  toggleLink: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
  },
});
