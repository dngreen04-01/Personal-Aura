import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../lib/theme';

const TABS = ['Strength', 'Volume', 'Streak'];

export default function MetricToggleBar({ activeTab, onTabChange }) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => onTabChange(tab)}
          >
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...fonts.semibold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.bgDark,
  },
});
