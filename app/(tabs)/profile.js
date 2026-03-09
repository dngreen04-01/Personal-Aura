import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';
import { useRouter } from 'expo-router';
import { getUserProfile, resetDatabase } from '../../lib/database';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const p = await getUserProfile();
      setProfile(p);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={40} color={colors.bgDark} />
          </View>
          <Text style={styles.name}>Athlete</Text>
        </View>

        {profile && (
          <View style={styles.infoCards}>
            <InfoCard icon="flag" label="Goal" value={profile.goal} />
            <InfoCard icon="fitness-center" label="Equipment" value={profile.equipment?.replace('_', ' ')} />
            {profile.age && <InfoCard icon="cake" label="Age / Weight" value={`${profile.age}yo, ${profile.weight_kg}kg`} />}
            {profile.gender && <InfoCard icon="person" label="Gender" value={profile.gender} />}
          </View>
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => {
              Alert.alert('Reset App', 'This will clear all data and restart onboarding.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: async () => {
                    await resetDatabase();
                    router.replace('/onboarding');
                  },
                },
              ]);
            }}
          >
            <MaterialIcons name="restart-alt" size={18} color="#ef4444" />
            <Text style={styles.resetText}>Reset Onboarding (Dev)</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <View style={styles.card}>
      <MaterialIcons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  content: { flex: 1, padding: spacing.lg, gap: spacing.xl },
  avatarSection: { alignItems: 'center', gap: spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  infoCards: { gap: spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderLight,
  },
  cardLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.textPrimary, textTransform: 'capitalize', marginTop: 2 },
  resetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  resetText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#ef4444' },
});
