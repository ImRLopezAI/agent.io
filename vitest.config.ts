import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		pool: 'forks',
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'src/lib/mock/tdd/defineSchemaWithFlowFields.test.ts',
			'src/lib/mock/tdd/deployShapes.test.ts',
		],
		environment: 'jsdom',
	},
})
