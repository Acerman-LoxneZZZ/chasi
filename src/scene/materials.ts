import { Color, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

export const makeGlass = () => new MeshPhysicalMaterial({
  name: 'watch_glass_browser',
  color: '#edf5fa',
  metalness: 0,
  roughness: 0.035,
  transmission: 0,
  thickness: 0.018,
  ior: 1.46,
  transparent: true,
  opacity: 0.055,
  depthWrite: false,
  side: FrontSide,
  envMapIntensity: 0.5,
})

export function highlightMaterial(material: MeshStandardMaterial, selected: boolean) {
  if (!material.userData.restEmissive) {
    material.userData.restEmissive = material.emissive.clone()
    material.userData.restEmissiveIntensity = material.emissiveIntensity
  }
  material.emissive.copy(selected ? new Color('#9b6c2f') : material.userData.restEmissive)
  material.emissiveIntensity = selected ? 0.22 : material.userData.restEmissiveIntensity
}
