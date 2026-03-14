import { View, Text, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';

export default function ImageMessage({ image, caption }) {
  return (
    <View style={imageStyles.container}>
      <View style={imageStyles.header}>
        <View style={imageStyles.headerLeft}>
          <MaterialIcons name="image" size={18} color={colors.primary} />
          <Text style={imageStyles.headerTitle}>Exercise Demo</Text>
        </View>
      </View>
      {image && (
        <Image
          source={{ uri: image }}
          style={imageStyles.image}
          resizeMode="contain"
        />
      )}
      {caption ? (
        <Text style={imageStyles.caption}>{caption}</Text>
      ) : null}
    </View>
  );
}

const imageStyles = StyleSheet.create({
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
  image: {
    width: '100%',
    height: 280,
    backgroundColor: colors.bgDarker,
  },
  caption: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    lineHeight: 19,
  },
});
