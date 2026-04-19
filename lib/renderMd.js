import { Text } from 'react-native';
import { colors } from './theme';

export function renderMd(text) {
  if (!text) return '';
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return <Text>{text}</Text>;
  return (
    <Text>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontFamily: 'Inter_700Bold', color: colors.primary }}>{part}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  );
}
