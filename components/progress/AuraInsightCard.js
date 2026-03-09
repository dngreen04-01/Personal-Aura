import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, radius, fonts } from '../../lib/theme';

const FALLBACK = "Keep pushing — every rep builds the best version of you.";

export default function AuraInsightCard({ insight, loading }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      shimmer.setValue(0);
    }
  }, [loading]);

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.card}>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>A</Text>
          <View style={styles.sparkle}>
            <Text style={{ fontSize: 8 }}>✨</Text>
          </View>
        </View>
        <Text style={styles.label}>Aura Insight</Text>
      </View>
      {loading ? (
        <Animated.View style={[styles.shimmerLine, { opacity: shimmerOpacity }]} />
      ) : (
        <Text style={styles.insightText}>{insight || FALLBACK}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { ...fonts.bold, fontSize: 14, color: colors.bgDark },
  sparkle: { position: 'absolute', top: -2, right: -4 },
  label: { ...fonts.semibold, fontSize: 12, color: colors.primaryDim },
  insightText: { ...fonts.regular, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  shimmerLine: {
    height: 14,
    backgroundColor: colors.bgCardSolid,
    borderRadius: 4,
    width: '80%',
  },
});
