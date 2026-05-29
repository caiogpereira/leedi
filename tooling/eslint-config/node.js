import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { base } from './index.js';

/** @type {import('typescript-eslint').ConfigArray} */
export const nodeConfig = tseslint.config(...base, eslintConfigPrettier);

export default nodeConfig;
