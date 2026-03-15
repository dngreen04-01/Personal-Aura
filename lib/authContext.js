import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import { auth } from './firebase';
import { firestore } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getDatabase, closeDatabase, getFailedSyncCount } from './database';
import { initializeSync, teardownSync } from './sync';

const AuthContext = createContext({
  user: null,
  loading: true,
  syncStatus: { syncing: false, pendingCount: 0, error: null },
});

async function registerPushToken(uid) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    // Save push token to Firestore profile
    const profileRef = doc(firestore, 'users', uid, 'profile', 'main');
    await updateDoc(profileRef, { pushToken, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('[Auth] Push token registration failed:', err.message);
  }
}

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

          // Initialize sync engine
          setSyncStatus(prev => ({ ...prev, syncing: true }));
          const cleanup = await initializeSync(firebaseUser.uid);
          cleanupRef.current = cleanup;

          // Check for failed syncs
          const failedCount = await getFailedSyncCount();
          setSyncStatus({ syncing: false, pendingCount: failedCount, error: null });

          // Register push token for notifications
          registerPushToken(firebaseUser.uid);
        } catch (err) {
          console.warn('[Auth] Sync initialization error:', err.message);
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
