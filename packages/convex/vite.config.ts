import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite-plus'

// Mirrors the "@/*" → "./src/*" tsconfig path alias for vitest (vp test).
export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			'@convex': fileURLToPath(new URL('./src/_generated', import.meta.url)),
		},
	},
})
