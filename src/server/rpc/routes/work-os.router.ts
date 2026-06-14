import { org, os } from '@server/rpc/init'
export const workOsRouter = os.workOs.router({
	organization: {
		getOrganization: org.workOs.organization.getOrganization.handler(
			async ({ context, input }) => {
				return context.workOs.organizations.getOrganization(input.id)
			},
		),
		listOrganizations: org.workOs.organization.listOrganizations.handler(
			async ({ context }) => {
				const { data } = await context.workOs.organizations.listOrganizations()
				return data
			},
		),
	},
})
