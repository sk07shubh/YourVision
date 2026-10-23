import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const extensionRoot = fileURLToPath(new URL('.', import.meta.url));

function productionManifestPlugin(apiUrl: string, productionBuild: boolean): Plugin {
  return {
    name: 'yourvision-production-manifest',
    closeBundle() {
      const manifestPath = resolve(extensionRoot, 'dist/manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        host_permissions: string[];
      };
      if (productionBuild) {
        const parsed = new URL(apiUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
          throw new Error('Production VITE_YOURVISION_API_URL must be an HTTPS origin without credentials.');
        }
        manifest.host_permissions = manifest.host_permissions.filter(
          permission => !permission.startsWith('http://127.0.0.1:') &&
            !permission.startsWith('http://localhost:')
        );
        const originPermission = `${parsed.origin}/*`;
        if (!manifest.host_permissions.includes(originPermission)) {
          manifest.host_permissions.push(originPermission);
        }
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, extensionRoot, 'VITE_');
  const productionBuild = process.env.YOURVISION_PRODUCTION_BUILD === 'true';
  const apiUrl = env.VITE_YOURVISION_API_URL || 'http://127.0.0.1:3000';
  if (productionBuild && !env.VITE_YOURVISION_API_URL) {
    throw new Error('Set VITE_YOURVISION_API_URL to your deployed HTTPS backend before a production extension build.');
  }

  return {
    plugins: [react(), productionManifestPlugin(apiUrl, productionBuild)],
    define: {
      'import.meta.env.VITE_YOURVISION_API_URL': JSON.stringify(apiUrl)
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          content: resolve(extensionRoot, 'src/content/main.tsx'),
          background: resolve(extensionRoot, 'src/background/service-worker.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
