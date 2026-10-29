export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

export interface WatchPart {
  id: string
  nodeName: string
  title: string
  description: string
  materialLabel: string
  category: 'case' | 'dial' | 'movement' | 'fastener'
  start: number
  end: number
  restPosition: Vec3
  explodedOffset: Vec3
  restQuaternion: Quat
  explodedQuaternion: Quat
  restScale: Vec3
  labelAnchor: Vec3
  selectable: boolean
}

export interface PartPose {
  position: Vec3
  quaternion: Quat
  scale: Vec3
}

export type SceneStatus = 'loading' | 'ready' | 'error' | 'unsupported' | 'context-lost'
