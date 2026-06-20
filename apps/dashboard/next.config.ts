import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

// Load the monorepo-root .env into process.env BEFORE Next compiles. Next only
// auto-loads .env from this app's own directory, so root-level NEXT_PUBLIC_* vars
// (e.g. NEXT_PUBLIC_VAPID_PUBLIC_KEY) would otherwise be undefined at the point
// Next inlines them into the client bundle — silently breaking push registration.
// next.config is evaluated before client compilation, so this is the right hook.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // .env absent in production/CI — NEXT_PUBLIC_* come from the host environment.
}

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  // Pin the file-tracing root to the monorepo root. Without this, a stray
  // lockfile higher in the tree (e.g. ~/pnpm-lock.yaml) makes Next infer the
  // wrong workspace root (the whole home dir), slowing dev compilation.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@leedi/ui', '@leedi/auth', '@leedi/config', '@leedi/db', '@leedi/knowledge', '@leedi/notification', '@leedi/tenancy', '@leedi/observability'],
  webpack(config, { isServer }) {
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
      },
    };

    if (isServer) {
      // Externalize node: built-ins so webpack doesn't try to bundle them.
      // Needed because transpilePackages forces webpack to process packages
      // that use node:path, node:crypto, node:async_hooks, etc.
      const existing = config.externals;
      const nodeExternals = (
        { request }: { request?: string },
        callback: (err?: Error | null, result?: string) => void
      ) => {
        if (request?.startsWith('node:')) {
          callback(null, `commonjs ${request}`);
          return;
        }
        callback();
      };
      if (Array.isArray(existing)) {
        config.externals = [...existing, nodeExternals];
      } else if (existing) {
        config.externals = [existing as Parameters<typeof nodeExternals>[0], nodeExternals];
      } else {
        config.externals = [nodeExternals];
      }
    } else {
      // Client bundle: provide empty fallbacks so the build doesn't fail if a
      // server-only package leaks into the client module graph via transpilePackages.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        path: false,
        url: false,
        crypto: false,
        fs: false,
        async_hooks: false,
      };
    }

    return config;
  },
};

export default withNextIntl(nextConfig);