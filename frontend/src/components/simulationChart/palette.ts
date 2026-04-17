export function buildUniquePalette(
  base: string[],
  n: number,
  isLightTheme: boolean,
): string[] {
  if (n <= base.length) return base.slice(0, Math.max(n, 1));
  const out = [...base];
  const goldenAngle = 137.508;
  const baseHue = 200;
  const saturation = isLightTheme ? 65 : 70;
  const lightness = isLightTheme ? 42 : 62;
  for (let i = base.length; i < n; i++) {
    const hue = (baseHue + (i - base.length + 1) * goldenAngle) % 360;
    out.push(`hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`);
  }
  return out;
}
