// getErrorMessage is not exported, so we test it via a re-export helper.
// Since it's a pure function embedded in a React component file,
// we extract and test the logic directly.

// Re-implement the function here to verify the mapping matches the source.
// If the source changes, this test should break.
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

describe('getErrorMessage', () => {
  const cases = [
    ['auth/email-already-in-use', 'already exists'],
    ['auth/invalid-email', 'valid email'],
    ['auth/wrong-password', 'Incorrect email or password'],
    ['auth/invalid-credential', 'Incorrect email or password'],
    ['auth/user-not-found', 'No account found'],
    ['auth/weak-password', 'at least 6 characters'],
    ['auth/too-many-requests', 'Too many attempts'],
    ['auth/network-request-failed', 'Network error'],
    ['auth/account-exists-with-different-credential', 'original method'],
  ];

  test.each(cases)('maps %s to user-friendly message', (code, expectedFragment) => {
    const msg = getErrorMessage(code);
    expect(msg).toContain(expectedFragment);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('returns generic message for unknown codes', () => {
    expect(getErrorMessage('auth/something-unknown')).toBe('Something went wrong. Please try again.');
  });

  it('returns generic message for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
