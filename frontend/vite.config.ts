// vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// jsPDF ships an optional DOM-capture `.html()` plugin whose bundled code
// contains `import('html2canvas')`. This app's PDF export is pure jsPDF text
// layout and never calls that plugin, so the html2canvas package is not
// installed. Without intervention, Vite (dev) and Rollup (build) both try to
// resolve that dynamic import and fail. This plugin rewrites it inside
// jsPDF's file into a rejected promise: jsPDF only evaluates it if `.html()`
// is actually called, which never happens, so the rewrite is dead-code-safe.
function neutralizeJspdfDomCapture(): Plugin {
  return {
    name: 'neutralize-jspdf-dom-capture',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('jspdf.es.min.js')) {
        return code.replace(
          'import("html2canvas")',
          'Promise.reject(new Error("jsPDF DOM capture (.html) is unavailable in this build"))'
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), neutralizeJspdfDomCapture()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Serve jsPDF as native ESM instead of pre-bundling it: esbuild cannot
    // resolve its optional `import('html2canvas')` from disk, and the plugin
    // above rewrites that import when the file is served/transformed.
    exclude: ['jspdf'],
  },
});