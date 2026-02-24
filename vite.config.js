import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('yet-another-react-lightbox')) return 'vendor-lightbox'
          if (id.includes('lucide-react')) return 'vendor-lucide'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('react-masonry-css')) return 'vendor-masonry'
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
