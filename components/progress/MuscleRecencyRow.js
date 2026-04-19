import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

export default function MuscleRecencyRow({ group, daysAgo, sessions4w }) {
  const maxSessions = 8;
  const pct = Math.min(100, (sessions4w / maxSessions) * 100);
  const freshness =
    daysAgo === 0 ? 'today'
    : daysAgo === 1 ? 'yesterday'
    : daysAgo >= 30 ? '30d+ ago'
    : `${daysAgo}d ago`;
  const barColor =
    daysAgo === 0 ? colors.primary
    : daysAgo <= 2 ? 'rgba(212,255,0,0.7)'
    : daysAgo <= 4 ? 'rgba(212,255,0,0.4)'
    : 'rgba(212,255,0,0.2)';

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.group}>{group}</Text>
        <Text style={styles.meta}>{freshness} · {sessions4w}×</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  group: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
