import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { hasCompletedOnboarding } from '../lib/database';
import { colors } from '../lib/theme';

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const onboarded = await hasCompletedOnboarding();
      if (onboarded) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    } catch (e) {
      console.error('DB check failed:', e);
      router.replace('/onboarding');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDark, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
