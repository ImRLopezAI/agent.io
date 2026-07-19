export * from './schemas/index.ts'
export * from './routing/index.ts'
export * from './work-os/index.ts'
// Prefer `@agent.io/domain/config` so boot loaders stay explicit; re-export
// types/helpers only when consumers already import from the package root.
export {
	APPS,
	type AppName,
	type Env,
	type EnvFor,
	envSchema,
	loadEnv,
	parseEnv,
} from './config/index.ts'
