import { defineConfig } from 'vite-plus'
import type { OxlintConfig } from 'vite-plus/lint'

const generatedIgnore = [
	'**/packages/convex/src/_generated/**',
	'**/convex/_generated/**',
	'**/.turbo/**',
	'**/.output/**',
	'**/dist/**',
]

/** Oxfmt settings migrated from the former root biome.json. */
const fmt = {
	useTabs: true,
	tabWidth: 2,
	printWidth: 80,
	singleQuote: true,
	jsxSingleQuote: true,
	quoteProps: 'as-needed' as const,
	trailingComma: 'all' as const,
	semi: false,
	arrowParens: 'always' as const,
	bracketSameLine: false,
	bracketSpacing: true,
	sortImports: true,
	ignorePatterns: generatedIgnore,
	overrides: [
		{
			files: ['**/*.md'],
			options: {
				proseWrap: 'always' as const,
			},
		},
	],
}

/** Oxlint rules migrated from the former root biome.json. */
const lint = {
	ignorePatterns: generatedIgnore,
	jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
	plugins: ['typescript', 'import'],
	options: {
		typeAware: true,
		typeCheck: true,
	},
	rules: {
		'vite-plus/prefer-vite-plus-imports': 'error',
		'react/no-danger': 'off',
		'react-hooks/exhaustive-deps': 'off',
		'react/no-array-index-key': 'warn',
		'no-unused-expressions': 'warn',
	},
	overrides: [
		{
			files: ['apps/back-office/**', 'packages/ui/**'],
			plugins: ['typescript', 'react', 'jsx-a11y', 'import'],
			env: {
				browser: true,
			},
			rules: {
				'jsx-a11y/prefer-tag-over-role': 'warn',
				'react/button-has-type': 'warn',
			},
		},
		{
			files: [
				'apps/v-inbound/**',
				'apps/v-outbound/**',
				'apps/messages/**',
				'packages/convex/**',
				'packages/domain/**',
			],
			plugins: ['typescript', 'node', 'import'],
			env: {
				node: true,
			},
		},
		{
			files: ['**/*.{test,spec}.{ts,tsx}'],
			plugins: ['typescript', 'vitest', 'react'],
			rules: {
				'@typescript-eslint/no-explicit-any': 'off',
			},
		},
	],
} satisfies OxlintConfig

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	fmt,
	lint,
})
