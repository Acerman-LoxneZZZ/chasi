import type { CSSProperties } from 'react'

export type IconName = 'rotate' | 'expand' | 'collapse' | 'pause' | 'arrow' | 'close' | 'check' | 'sun' | 'layers' | 'cursor' | 'reset' | 'chevron'
const paths: Record<IconName, string> = {
  rotate: 'M4 10a8 8 0 1 1 1.7 7M4 4v6h6M12 8v4l3 2',
  expand: 'm8 7 4-3 4 3M12 4v6m-4 7 4 3 4-3m-4 3v-6M4 12h3m10 0h3',
  collapse: 'm8 4 4 3 4-3M12 2v5m-4 13 4-3 4 3m-4-3v5M4 12h3m10 0h3',
  pause: 'M8 5v14M16 5v14',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  cursor: 'm5 3 14 9-7 1-3 7L5 3Z',
  reset: 'M4 10a8 8 0 1 1 1.7 7M4 4v6h6',
  chevron: 'm9 5 7 7-7 7',
}

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={paths[name]} /></svg>
}

export function WatchMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="30" height="38" viewBox="0 0 32 40" fill="none" aria-hidden="true"><circle cx="16" cy="24" r="13" stroke="currentColor" strokeWidth="1.3"/><circle cx="16" cy="24" r="9.5" stroke="currentColor" strokeWidth=".6"/><path d="M16 24v-7m0 7 5 3M12 10V7h8v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="16" cy="4" r="3" stroke="currentColor" strokeWidth="1.1"/></svg>
}
