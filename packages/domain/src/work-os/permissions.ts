import type { Permission } from './types'

export const DEFAULT_PERMISSIONS = [
	{
		name: 'Prompt Editor',
		description: 'Can edit prompts',
		slug: 'prompts:write',
	},
	{
		name: 'Prompt Viewer',
		description: 'Can view prompts',
		slug: 'prompts:read',
	},
	{
		name: 'Prompt Approver',
		description: 'Can approve prompts',
		slug: 'prompts:require-approval',
	},
	{
		name: 'Prompt Admin',
		description: 'Can admin prompts',
		slug: 'prompts:admin',
	},
	{
		name: 'Workflow Editor',
		description: 'Can edit workflows',
		slug: 'workflows:write',
	},
	{
		name: 'Workflow Viewer',
		description: 'Can view workflows',
		slug: 'workflows:read',
	},
	{
		name: 'Workflow Approver',
		description: 'Can approve workflows',
		slug: 'workflows:require-approval',
	},
	{
		name: 'Workflow Admin',
		description: 'Can admin workflows',
		slug: 'workflows:admin',
	},
	{
		name: 'Conversation Reader',
		description: 'Can read conversations',
		slug: 'conversations:read',
	},
	{
		name: 'Conversation Admin',
		description: 'Can admin conversations',
		slug: 'conversations:admin',
	},
] as const satisfies readonly Permission[]
