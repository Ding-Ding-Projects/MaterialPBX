import { createWorldLensDesignSystem } from '@worldlens/design-system'

/**
 * MaterialPBX consumes the WorldLens design package directly. Product-specific
 * styling belongs in MaterialPBX; shared tokens and component defaults remain
 * owned by @worldlens/design-system.
 */
export function createMaterialPbxDesignSystem() {
  return createWorldLensDesignSystem({
    defaultTheme: 'dark',
  })
}

export { WORLDLENS_COMPONENT_DEFAULTS, WORLDLENS_THEME_NAMES, WORLDLENS_THEMES } from '@worldlens/design-system'
