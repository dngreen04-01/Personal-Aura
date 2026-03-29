import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { getDatabase, closeDatabase, getFailedSyncCount } from './database';
import { initializeSync, teardownSync } from './sync';

const AuthContext = createContext({
  user: null,
  loading: true,
  syncStatus: { syncing: false, pendingCount: 0, error: null },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ syncing: false, pendingCount: 0, error: null });
  const cleanupRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Open user-keyed database
          await getDatabase(firebaseUser.uid);

          // Initialize sync engine (non-blocking — don't hold up auth state)
          setSyncStatus(prev => ({ ...prev, syncing: true }));
          initializeSync(firebaseUser.uid)
            .then(cleanup => {
              cleanupRef.current = cleanup;
              return getFailedSyncCount();
            })
            .then(failedCount => {
              setSyncStatus({ syncing: false, pendingCount: failedCount, error: null });
            })
            .catch(err => {
              console.warn('[Auth] Sync initialization error:', err.message);
              setSyncStatus({ syncing: false, pendingCount: 0, error: err.message });
            });

        } catch (err) {
          console.warn('[Auth] Database initialization error:', err.message);
          setSyncStatus({ syncing: false, pendingCount: 0, error: err.message });
        }
      } else {
        // Teardown sync and close database
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        } else {
          teardownSync();
        }
        await closeDatabase();
        setSyncStatus({ syncing: false, pendingCount: 0, error: null });
      }
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, syncStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
