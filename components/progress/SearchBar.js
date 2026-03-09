import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function SearchBar({ value, onChangeText, placeholder = 'Search exercises...' }) {
  return (
    <View style={styles.container}>
      <MaterialIcons name="search" size={20} color={colors.textSecondary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...fonts.regular,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
});
