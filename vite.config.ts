import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { componentTagger } from 'lovable-tagger';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const buildVersion = Date.now().toString(); // Unique version per build

  return {
    server: {
      port: 8080,
      host: '::',
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      // Plugin to inject build version
      {
        name: 'inject-build-version',
        configResolved() {
          // This runs at build time
        },
        transformIndexHtml(html) {
          // Inject build version as a script tag
          return html.replace(
            '<head>',
            `<head>\n    <script>window.__BUILD_VERSION__ = "${buildVersion}";</script>`
          );
        },
      },
    ].filter(Boolean),
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    envPrefix: 'VITE_',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Ensure assets are properly versioned
      rollupOptions: {
        output: {
          // Add hash to filenames for cache busting
          entryFileNames: `assets/[name].[hash].js`,
          chunkFileNames: `assets/[name].[hash].js`,
          assetFileNames: `assets/[name].[hash].[ext]`,
          // Manual chunks for better caching and loading
          manualChunks: {
            // Vendor libraries
            vendor: ['react', 'react-dom'],
            // Supabase and data libraries
            supabase: ['@supabase/supabase-js'],
            // UI libraries
            ui: ['lucide-react'],
          },
        },
      },
      // Generate sourcemaps for debugging (optional)
      sourcemap: mode === 'development',
      // Increase chunk size warning limit since we're optimizing
      chunkSizeWarningLimit: 1000,
    },
  };
});
