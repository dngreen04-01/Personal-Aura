import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';

export default function PRCardFull({ exercise, weight, unit = 'kg', reps, date, improvement, isNew }) {
  return (
    <View style={[styles.card, isNew && styles.cardNew]}>
      {isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      )}
      <View style={styles.row}>
        <MaterialIcons
          name="emoji-events"
          size={14}
          color={isNew ? colors.primary : colors.textSecondary}
        />
        <Text style={styles.exercise}>{exercise}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, isNew && styles.valueNew]}>
          {weight != null ? weight : reps}
        </Text>
        <Text style={styles.suffix}>
          {weight != null ? `${unit}${reps ? ` × ${reps}` : ''}` : 'reps'}
        </Text>
      </View>
      <View style={styles.footer}>
        {date ? <Text style={styles.date}>{date}</Text> : null}
        {improvement != null && improvement !== 0 ? (
          <Text style={styles.delta}>
            {improvement > 0 ? '+' : ''}{improvement}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    position: 'relative',
  },
  cardNew: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.borderSubtle,
  },
  newBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  newBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1.5,
    color: colors.bgDark,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  exercise: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  value: {
    fontSize: 34,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -1,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  valueNew: { color: colors.primary },
  suffix: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
  },
  delta: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
  },
});
