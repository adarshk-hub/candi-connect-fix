export interface PieSlice {
  label: string
  value: number
  color: string
}

export function pieSlicePaths(slices: PieSlice[], cx = 100, cy = 100, r = 100) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1
  let angle = -90
  return slices.map((s) => {
    const fraction = s.value / total
    const startAngle = angle
    const endAngle = angle + fraction * 360
    angle = endAngle

    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x1 = cx + r * Math.cos(toRad(startAngle))
    const y1 = cy + r * Math.sin(toRad(startAngle))
    const x2 = cx + r * Math.cos(toRad(endAngle))
    const y2 = cy + r * Math.sin(toRad(endAngle))
    const largeArc = endAngle - startAngle > 180 ? 1 : 0

    const path =
      fraction >= 0.9995
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return { ...s, path, percent: (fraction * 100).toFixed(1) }
  })
}

export const PALETTE = [
  '#a78bfa',
  '#fbbf24',
  '#fb923c',
  '#60a5fa',
  '#34d399',
  '#f87171',
  '#818cf8',
  '#2dd4bf',
  '#facc15',
  '#9ca3af',
]
