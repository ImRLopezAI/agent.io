import type { Organization } from '@workos-inc/node'
import { z } from 'zod'
import { base } from './base'

/**
 * WorkOS organization contract. Output types reuse the WorkOS SDK's
 * `Organization` type (a type-only import — erased at build, so no SDK runtime
 * reaches the client). `z.custom` carries the type to the client without
 * authoring a full schema; tighten to real zod schemas when you want runtime
 * validation and a populated OpenAPI response body.
 */
export const workOsContract = {
	organization: {
		getOrganization: base
			.route({
				method: 'GET',
				path: '/workos/organizations/{id}',
				tags: ['WorkOS'],
				summary: 'Fetch an organization by id',
			})
			.input(z.object({ id: z.string() }))
			.output(z.custom<Organization>()),
		listOrganizations: base
			.route({
				method: 'GET',
				path: '/workos/organizations',
				tags: ['WorkOS'],
				summary: 'List organizations',
			})
			.output(z.custom<Organization[]>()),
	},
} as const
