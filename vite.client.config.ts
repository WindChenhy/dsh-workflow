import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const pkgName = 'dsh-workflow-orchestrator'

/**
 * Browser half: a CJS classic script loaded by DSH's ModuleLoader.
 * Platform modules stay external (provided by the shell's module table);
 * everything else is inlined so the bundle has no runtime imports.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@core': resolve(process.cwd(), 'src/core') },
  },
  build: {
    outDir: 'dist-client',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/client/index.ts',
      formats: ['cjs'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^react(\/|$)/, /^react-dom(\/|$)/, /^@deepseek-ai\//],
      output: {
        entryFileNames: 'client.js',
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => {`,
        intro: 'var module = { exports: {} }; var exports = module.exports;',
        footer: 'return module.exports; } });',
      },
    },
  },
})
