import { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../lib/theme';

export default function AuraOrb({ size = 28, thinking = false }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const peak = thinking ? 1.15 : 1.04;
    const dur = thinking ? 700 : 2000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: peak,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [thinking, scale]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale }],
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="orbGrad" cx="30%" cy="30%" r="70%" fx="30%" fy="30%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="1" />
            <Stop offset="50%" stopColor="#88aa00" stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.bgDark} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orbGrad)" />
      </Svg>
      <View
        style={[
          styles.highlight,
          {
            top: size * 0.15,
            left: size * 0.2,
            width: size * 0.35,
            height: size * 0.35,
            borderRadius: size * 0.175,
          },
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
});
