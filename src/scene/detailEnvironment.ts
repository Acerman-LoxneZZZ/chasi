import { CubeUVReflectionMapping, DataTexture, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat } from 'three'

/** The previous 128px RoomEnvironment PMREM, baked losslessly. Loading lighting
 * data avoids running its six cube faces and blur passes on the scroll thread. */
export async function loadDetailEnvironment(signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}lighting/detail-room.bin`, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Lighting HTTP ${response.status}`)
  const buffer = await response.arrayBuffer()
  const width = 384, height = 512
  if (buffer.byteLength !== width * height * 4 * 2) throw new Error('Invalid detail lighting data')
  const texture = new DataTexture(new Uint16Array(buffer), width, height, RGBAFormat, HalfFloatType)
  texture.mapping = CubeUVReflectionMapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = LinearSRGBColorSpace
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
