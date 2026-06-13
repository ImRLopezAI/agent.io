import { createContext, use } from 'react'
import type { NavGroup } from './items'

export interface SidebarContextProps {
	items: NavGroup[]
	pathname: string
	navigate: (to: string) => void
}

export const AppSidebarContext = createContext<SidebarContextProps | undefined>(
	undefined,
)
export function useAppSidebar() {
	const context = use(AppSidebarContext)
	if (!context)
		throw new Error('useAppSidebar must be used within a AppSidebarProvider')
	return context
}
