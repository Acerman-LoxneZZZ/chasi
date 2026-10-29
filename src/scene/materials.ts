import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

export const makeGlass = () => new MeshPhysicalMaterial({
  name: 'watch_glass_browser',
  color: '#dce9ef',
  metalness: 0,
  roughness: 0.08,
  transmission: 0,
  thickness: 0.018,
  ior: 1.46,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  side: DoubleSide,
  envMapIntensity: 0.55,
})

export function highlightMaterial(material: MeshStandardMaterial, selected: boolean) {
  if (!material.userData.restEmissive) {
    material.userData.restEmissive = material.emissive.clone()
    material.userData.restEmissiveIntensity = material.emissiveIntensity
  }
  material.emissive.copy(selected ? new Color('#9b6c2f') : material.userData.restEmissive)
  material.emissiveIntensity = selected ? 0.22 : material.userData.restEmissiveIntensity
}
