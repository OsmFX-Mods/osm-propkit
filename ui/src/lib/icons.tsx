import { createElement, type CSSProperties } from 'react'
import { PATHS, type IconName } from './icons.data'

export type { IconName }
export type Weight = 'regular' | 'duotone' | 'fill'
export type Motion = 'nudge' | 'back' | 'lift' | 'drop' | 'tilt' | 'turn' | 'pop' | 'drive' | 'wiggle' | 'spin'

const W: Record<Weight, number> = { regular: 0, duotone: 1, fill: 2 }

// Icon: a Phosphor glyph at text scale, `motion` names how it moves when its control (a .group) is hovered or `on`
export function Icon({ name, size = '1em', weight = 'regular', motion, on, className, style }: {
  name: IconName; size?: number | string; weight?: Weight; motion?: Motion; on?: boolean; className?: string; style?: CSSProperties
}) {
  const els = PATHS[name][W[weight]] as [string, Record<string, string>][]
  const cls = ['ico', motion && `ico-${motion}`, on && 'on', className].filter(Boolean).join(' ')
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden style={style}>
      {els.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}
