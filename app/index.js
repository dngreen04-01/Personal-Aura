import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/authContext';
import { hasCompletedOnboarding, getIncompleteSession, discardSession } from '../lib/database';
import { colors } from '../lib/theme';

export default function Index() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/auth');
      return;
    }

    checkOnboarding();
  }, [user, authLoading]);

  const checkOnboarding = async () => {
    try {
      const onboarded = await hasCompletedOnboarding();
      if (onboarded) {
        const incomplete = await getIncompleteSession();
        if (incomplete) {
          const position = JSON.parse(incomplete.position_json || '{}');
          Alert.alert(
            'Resume Workout?',
            `You have an unfinished ${incomplete.focus || 'workout'} session.`,
            [
              { text: 'Discard', style: 'destructive', onPress: async () => {
                await discardSession(incomplete.id);
                router.replace('/(tabs)');
              }},
              { text: 'Resume', onPress: () => {
                router.replace({
                  pathname: '/workout',
                  params: {
                    dayJson: incomplete.exercises_json,
                    resumeSessionId: String(incomplete.id),
                    startIdx: String(position.currentExIdx || 0),
                  },
                });
              }},
            ]
          );
          return;
        }
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
