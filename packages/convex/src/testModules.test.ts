/// <reference types="vite/client" />
/**
 * Module map for convex-test — MUST live at the functions root (src/) so the
 * glob keys match Convex function paths (e.g. "api/internals/agents").
 *
 * AuthKit validates env at module construction; tests never hit WorkOS, so
 * dummy values keep auth.ts loadable inside the convex-test environment.
 */
process.env.WORKOS_CLIENT_ID ??= 'client_test'
process.env.WORKOS_API_KEY ??= 'sk_test'
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test'

export const modules = import.meta.glob('./**/*.ts')

// A .test.ts name keeps this file OUT of the Convex bundle (import.meta.glob
// breaks the push); vitest needs at least one test to collect it.
import { expect, test } from 'vite-plus/test'

test('module map is populated', () => {
	expect(Object.keys(modules).length).toBeGreaterThan(0)
})
