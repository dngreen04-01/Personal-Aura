import React from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../lib/theme';
import { EQUIPMENT_CATEGORIES } from '../lib/equipmentData';

export default function SharedLocationDetail({
  location, visible, onClose, onClaim, onContribute, onReportMissing,
}) {
  if (!location) return null;

  const equipment = location.equipment || [];
  const contributorCount = (location.contributors || []).length;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={2}>{location.name}</Text>
                {location.verified && (
                  <MaterialIcons name="verified" size={18} color="#22c55e" />
                )}
              </View>
              {location.address ? (
                <Text style={styles.address} numberOfLines={1}>{location.address}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Stats Row */}
            <View style={styles.statsRow}>
              {location.distance != null && (
                <StatBadge icon="near-me" value={`${location.distance.toFixed(1)} km`} />
              )}
              <StatBadge icon="people" value={`${contributorCount} contributor${contributorCount !== 1 ? 's' : ''}`} />
              <StatBadge icon="fitness-center" value={`${equipment.length} items`} />
            </View>

            {/* Equipment by Category */}
            <Text style={styles.sectionTitle}>EQUIPMENT</Text>
            {EQUIPMENT_CATEGORIES.map(cat => {
              const catItems = cat.items.filter(item => equipment.includes(item.id));
              const missingItems = cat.items.filter(item => !equipment.includes(item.id));
              if (catItems.length === 0 && missingItems.length === 0) return null;
              return (
                <View key={cat.category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>{cat.category}</Text>
                  {catItems.map(item => (
                    <View key={item.id} style={styles.equipmentRow}>
                      <MaterialIcons name="check-circle" size={18} color="#22c55e" />
                      <Text style={styles.equipmentLabel}>{item.label}</Text>
                      {onReportMissing && (
                        <TouchableOpacity
                          style={styles.reportButton}
                          onPress={() => onReportMissing(location.id, item.id)}
                          hitSlop={8}
                        >
                          <Text style={styles.reportText}>Not here?</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {missingItems.map(item => (
                    <View key={item.id} style={styles.equipmentRow}>
                      <MaterialIcons name="radio-button-unchecked" size={18} color={colors.textMuted} />
                      <Text style={[styles.equipmentLabel, { color: colors.textMuted }]}>{item.label}</Text>
                      {onContribute && (
                        <TouchableOpacity
                          style={styles.addEquipButton}
                          onPress={() => onContribute(location.id, item.id)}
                          hitSlop={8}
                        >
                          <Text style={styles.addEquipText}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}

            <View style={{ height: spacing.xl }} />
          </ScrollView>

          {/* Claim Button */}
          {onClaim && (
            <TouchableOpacity
              style={styles.claimButton}
              onPress={() => onClaim(location.id)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="add-location-alt" size={20} color={colors.bgDark} />
              <Text style={styles.claimButtonText}>Claim This Gym</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatBadge({ icon, value }) {
  return (
    <View style={styles.statBadge}>
      <MaterialIcons name={icon} size={14} color={colors.primary} />
      <Text style={styles.statText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...fonts.bold,
    fontSize: 20,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  address: {
    ...fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.bgCard,
  },
  statText: {
    ...fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  categorySection: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    ...fonts.semibold,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
  },
  equipmentLabel: {
    ...fonts.medium,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  reportButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reportText: {
    ...fonts.medium,
    fontSize: 11,
    color: '#ef4444',
  },
  addEquipButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
  },
  addEquipText: {
    ...fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  claimButtonText: {
    ...fonts.bold,
    fontSize: 15,
    color: colors.bgDark,
  },
});
