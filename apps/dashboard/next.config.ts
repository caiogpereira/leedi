import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@leedi/ui', '@leedi/auth', '@leedi/config', '@leedi/db', '@leedi/knowledge', '@leedi/notification', '@leedi/tenancy', '@leedi/observability'],
  webpack(config) {
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
      },
    };
    return config;
  },
};

export default withNextIntl(nextConfig);