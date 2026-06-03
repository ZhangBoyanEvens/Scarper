const linear = (t: number) => t
const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10))

export function applyEase(t: number, ease: false | 'inExpo' = false): number {
  return ease === 'inExpo' ? easeInExpo(t) : linear(t)
}
