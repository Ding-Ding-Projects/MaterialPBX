import { createApp } from 'vue'
import { createMaterialPbxDesignSystem } from '@materialpbx/design-integration'
import { MaterialPbxApp } from '@materialpbx/ui'
import 'vuetify/styles'
import '@worldlens/design-system/tokens.css'
import '../../../packages/ui/src/styles.css'

createApp(MaterialPbxApp, { surface: 'web' })
  .use(createMaterialPbxDesignSystem())
  .mount('#app')
