import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../lib/theme';

const COLS = 7;

export default function ConsistencyHeatmap({ data = [], streak = 0 }) {
  const rows = Math.ceil(data.length / COLS);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      row.push(data[idx] || { date: '', intensity: 0 });
    }
    grid.push(row);
  }

  const getColor = (intensity) => {
    if (intensity === 0) return colors.bgCard;
    return `rgba(212, 255, 0, ${Math.min(intensity, 1)})`;
  };

  return (
    <View style={styles.container}>
      {streak > 0 && (
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 {streak} Day Streak</Text>
        </View>
      )}
      <View style={styles.grid}>
        {grid.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((cell, ci) => (
              <View
                key={ci}
                style={[styles.cell, { backgroundColor: getColor(cell.intensity) }]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Less</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((val, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: getColor(val) }]} />
        ))}
        <Text style={styles.legendLabel}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  streakBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212, 255, 0, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  streakText: { ...fonts.semibold, fontSize: 13, color: colors.primary },
  grid: { gap: 4 },
  row: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  legendCell: { width: 12, height: 12, borderRadius: 2 },
  legendLabel: { ...fonts.regular, fontSize: 10, color: colors.textSecondary },
});
