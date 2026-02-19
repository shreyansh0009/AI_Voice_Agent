import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: ['crmlaivoice.crmlvoice.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/ws/spy': {
        target: 'ws://localhost:5001',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    // Split vendor libraries into separate cacheable chunks
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached long-term
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-icons': ['react-icons', 'lucide-react'],
          // HTTP & utilities
          'vendor-utils': ['axios', 'date-fns'],
        },
      },
    },
    // Increase chunk size warning limit (default 500KB)
    chunkSizeWarningLimit: 600,
  },
})
