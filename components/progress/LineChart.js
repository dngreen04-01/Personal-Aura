import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../../lib/theme';

const PADDING = { top: 10, right: 10, bottom: 24, left: 10 };

function monotoneInterpolation(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
  }

  return path;
}

export default function LineChart({
  data = [],
  height = 160,
  color = colors.primary,
  gradientOpacity = 0.3,
  xLabels = [],
}) {
  if (!data || data.length === 0) return null;

  const width = 320; // Will be scaled by viewBox
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;

  const points = data.map((val, i) => ({
    x: PADDING.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: PADDING.top + chartH - ((val - minVal) / range) * chartH,
  }));

  const linePath = monotoneInterpolation(points);
  const areaPath = `${linePath}L${points[points.length - 1].x},${PADDING.top + chartH}L${points[0].x},${PADDING.top + chartH}Z`;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={gradientOpacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#chartGrad)" />
        <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {xLabels.length > 0 && xLabels.map((label, i) => {
          const x = PADDING.left + (i / Math.max(xLabels.length - 1, 1)) * chartW;
          return (
            <SvgText
              key={i}
              x={x}
              y={height - 4}
              fontSize={10}
              fill={colors.textSecondary}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
