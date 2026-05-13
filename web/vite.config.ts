import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  base: command === 'build' ? '/static/dist/' : '/',
  build: {
    outDir: '../api/public/static/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        login: resolve(__dirname, 'login.html'),
      },
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'css/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 4001,
    host: '0.0.0.0',
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 500,
    },
    hmr: {
      overlay: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/broadcasting': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
