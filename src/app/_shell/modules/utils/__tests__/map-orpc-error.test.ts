import { ORPCError } from '@orpc/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapOrpcError } from '../map-orpc-error'

const toastMock = vi.hoisted(() => ({
	error: vi.fn(),
}))

vi.mock('sonner', () => ({
	toast: toastMock,
}))

function makeForm() {
	return {
		setError: vi.fn(),
	} as unknown as Parameters<typeof mapOrpcError>[1]
}

describe('mapOrpcError', () => {
	beforeEach(() => {
		toastMock.error.mockClear()
	})

	it('routes CONFLICT to form.setError on the email field', () => {
		const form = makeForm()
		const err = new ORPCError('CONFLICT', { message: 'Already a member' })

		mapOrpcError(err, form)

		expect(form?.setError).toHaveBeenCalledWith('email', {
			type: 'server',
			message: 'Already a member',
		})
		expect(toastMock.error).not.toHaveBeenCalled()
	})

	it('falls back to a toast for CONFLICT when no form is supplied', () => {
		const err = new ORPCError('CONFLICT', { message: 'Already a member' })

		mapOrpcError(err)

		expect(toastMock.error).toHaveBeenCalledWith('Already a member')
	})

	it('toasts non-field-bound typed errors (NO_ADMIN_ROLE)', () => {
		const form = makeForm()
		const err = new ORPCError('NO_ADMIN_ROLE', { message: 'Admins only' })

		mapOrpcError(err, form)

		expect(toastMock.error).toHaveBeenCalledWith('Admins only')
		expect(form?.setError).not.toHaveBeenCalled()
	})

	it('shows a generic toast for unknown / non-typed errors', () => {
		mapOrpcError(new Error('boom'))
		expect(toastMock.error).toHaveBeenCalledWith('Something went wrong')

		toastMock.error.mockClear()
		mapOrpcError('a plain string')
		expect(toastMock.error).toHaveBeenCalledWith('Something went wrong')
	})
})
