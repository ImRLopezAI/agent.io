import { useAtom } from 'jotai'
import { atomWithReducer } from 'jotai/utils'

/**
 * Consolidated UI state for every org-module dialog, held in a SINGLE Jotai
 * reducer atom (not a fan-out of boolean atoms). Components dispatch actions
 * instead of holding local `useState` open flags, so dialog state is shared and
 * inspectable in one place. Jotai uses `useSyncExternalStore` internally.
 */

/** Dialogs that are a plain open/closed boolean. */
export type OrgDialog = 'create' | 'invite' | 'leave' | 'delete'

export type OrgDialogsState = {
	createOpen: boolean
	inviteOpen: boolean
	leaveOpen: boolean
	deleteOpen: boolean
	/** Membership targeted by the "remove member" confirm dialog, or null. */
	removeMembershipId: string | null
}

export type OrgDialogsAction =
	| { type: 'open'; dialog: OrgDialog }
	| { type: 'close'; dialog: OrgDialog }
	| { type: 'toggle'; dialog: OrgDialog }
	| { type: 'remove-member'; membershipId: string | null }

const INITIAL_STATE: OrgDialogsState = {
	createOpen: false,
	inviteOpen: false,
	leaveOpen: false,
	deleteOpen: false,
	removeMembershipId: null,
}

const OPEN_KEY: Record<OrgDialog, keyof OrgDialogsState> = {
	create: 'createOpen',
	invite: 'inviteOpen',
	leave: 'leaveOpen',
	delete: 'deleteOpen',
}

export function orgDialogsReducer(
	state: OrgDialogsState,
	action: OrgDialogsAction,
): OrgDialogsState {
	switch (action.type) {
		case 'open':
			return { ...state, [OPEN_KEY[action.dialog]]: true }
		case 'close':
			return { ...state, [OPEN_KEY[action.dialog]]: false }
		case 'toggle': {
			const key = OPEN_KEY[action.dialog]
			return { ...state, [key]: !state[key] }
		}
		case 'remove-member':
			return { ...state, removeMembershipId: action.membershipId }
		default:
			return state
	}
}

/** The single org-module dialog/UI-state atom. */
export const orgDialogsAtom = atomWithReducer(INITIAL_STATE, orgDialogsReducer)

/**
 * Thin hook returning `[state, dispatch]`. Components read open flags off
 * `state` and call `dispatch({ type, dialog })` to drive them, e.g.
 * `dispatch({ type: 'open', dialog: 'invite' })`.
 */
export function useOrgDialogs() {
	return useAtom(orgDialogsAtom)
}
