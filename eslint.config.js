// @ts-check
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default [
	...tseslint.configs.recommended,
	...eslintPluginAstro.configs['flat/recommended'],
	{
		ignores: ['dist/**', '.astro/**', 'node_modules/**', 'public/**', 'worker-configuration.d.ts', '.wrangler/**'],
	},
];
