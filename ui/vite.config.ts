import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds into the sibling html/ the resource ships; base './' so CEF loads assets by relative path. Target an old Chromium for CEF.
// The dev server may read ../docs for the workbench backdrops; that code is dev-only and never reaches the build.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: '../html',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'chrome91',
    cssTarget: 'chrome91',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
