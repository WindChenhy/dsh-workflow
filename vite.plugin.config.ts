import { defineConfig } from 'vite'

/**
 * Node-side DSH L5 bundle build.
 * DSH peer packages stay external: the host owns a single runtime instance.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-plugin',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/plugin/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^@deepseek-ai\//, /^node:/],
    },
  },
})
