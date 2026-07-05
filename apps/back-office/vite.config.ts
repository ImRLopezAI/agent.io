// import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

export default defineConfig({
	resolve: { tsconfigPaths: true },
	ssr: {
		optimizeDeps: {
			include: ['@vercel/oidc', '@ai-sdk/gateway'],
		},
		noExternal: [/^@sentry\//],
	},
	plugins: lazyPlugins(() => [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart({
			router: {
				routesDirectory: 'app',
				routeFileIgnorePattern: 'module',
			},
			serverFns: {
				disableCsrfMiddlewareWarning: true,
			},
		}),
		viteReact(),
		// sentryTanstackStart({
		// 	org: 'airobotix',
		// 	project: 'ontology',
		// 	authToken: process.env.SENTRY_AUTH_TOKEN,
		// }),
	]),
	build: {
		rolldownOptions: {
			output: {
				advancedChunks: {
					groups: [
						{
							name: 'vendor-react',
							test: /node_modules\/(react|react-dom)\//,
						},
						{
							name: 'vendor-tanstack',
							test: /node_modules\/@tanstack\/(react-router|react-virtual)\//,
						},
						{
							name: 'vendor-convex',
							test: /node_modules\/(convex|convex-helpers|@convex-dev)\//,
						},
						{
							name: 'vendor-charts',
							test: /node_modules\/(recharts|d3-)\//,
						},
						{
							name: 'vendor-streamdown',
							test: /node_modules\/@streamdown\//,
						},
					],
				},
			},
		},
	},
	test: {
		pool: 'forks',
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
	},
})
