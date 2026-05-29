import type { Config } from 'tailwindcss';
import leediConfig from '@leedi/tailwind-config';

const config: Config = {
  presets: [leediConfig],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
