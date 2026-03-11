import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';

export default function SwapExerciseWidget({ swap, onSwap }) {
  const [swapped, setSwapped] = useState(null);
  const alternatives = swap.alternatives || [];

  const handleSwap = (name) => {
    setSwapped(name);
    onSwap(name);
  };

  return (
    <View style={swapStyles.container}>
      <View style={swapStyles.header}>
        <View style={swapStyles.headerLeft}>
          <MaterialIcons name="swap-horiz" size={18} color={colors.primary} />
          <Text style={swapStyles.headerTitle}>Swap Exercise</Text>
        </View>
        <Text style={swapStyles.headerCount}>{alternatives.length} Alternatives</Text>
      </View>
      {alternatives.map((alt, idx) => {
        const isSwapped = swapped === alt.name;
        const isDisabled = swapped !== null;
        return (
          <View key={idx} style={[swapStyles.option, idx < alternatives.length - 1 && swapStyles.optionBorder]}>
            <View style={swapStyles.optionIcon}>
              <MaterialIcons name="fitness-center" size={20} color={alt.is_recommended ? colors.primary : colors.textSecondary} style={{ opacity: 0.6 }} />
            </View>
            <View style={swapStyles.optionInfo}>
              <View style={swapStyles.optionNameRow}>
                <Text style={swapStyles.optionName}>{alt.name}</Text>
                {alt.is_recommended && (
                  <View style={swapStyles.recBadge}>
                    <Text style={swapStyles.recBadgeText}>REC</Text>
                  </View>
                )}
              </View>
              <Text style={swapStyles.optionDesc}>{alt.description}</Text>
            </View>
            <TouchableOpacity
              style={[
                swapStyles.swapButton,
                alt.is_recommended && !isDisabled && swapStyles.swapButtonRec,
                isSwapped && swapStyles.swapButtonDone,
                isDisabled && !isSwapped && swapStyles.swapButtonDisabled,
              ]}
              onPress={() => handleSwap(alt.name)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Text style={[
                swapStyles.swapButtonText,
                alt.is_recommended && !isDisabled && swapStyles.swapButtonTextRec,
                isSwapped && swapStyles.swapButtonTextDone,
                isDisabled && !isSwapped && swapStyles.swapButtonTextDisabled,
              ]}>
                {isSwapped ? 'DONE' : 'SWAP'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const swapStyles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: 'rgba(212,255,0,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  headerCount: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm + 4,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.bgDarker || colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionInfo: {
    flex: 1,
  },
  optionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  recBadge: {
    backgroundColor: 'rgba(212,255,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  swapButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  swapButtonRec: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  swapButtonDone: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  swapButtonDisabled: {
    opacity: 0.3,
  },
  swapButtonText: {
    fontSize: 11,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  swapButtonTextRec: {
    color: colors.bgDark,
  },
  swapButtonTextDone: {
    color: 'rgb(34,197,94)',
  },
  swapButtonTextDisabled: {
    color: colors.textSecondary,
  },
});
