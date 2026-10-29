import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core.js')) return 'three-core'
          if (id.includes('/node_modules/three/')) return 'three-renderer'
        },
      },
    },
  },
})
