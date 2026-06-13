import { render, waitFor } from '@testing-library/react'
import { createStore, Provider as JotaiProvider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeApplier } from '#/components/provider/theme-applier'
import { colorFormatter } from '#/lib/theme/color'
import { getPresetThemeStyles } from '#/lib/theme/presets'
import { themeStateAtom } from '#/lib/theme/store/atoms'

const themeMock = vi.hoisted(() => ({
	resolvedTheme: 'light' as 'light' | 'dark',
}))

vi.mock('next-themes', () => ({
	useTheme: () => ({
		resolvedTheme: themeMock.resolvedTheme,
	}),
}))

const renderApplier = () => {
	const store = createStore()
	store.set(themeStateAtom, {
		currentMode: 'light',
		styles: getPresetThemeStyles('default'),
	})
	render(
		<JotaiProvider store={store}>
			<ThemeApplier />
		</JotaiProvider>,
	)
	return store
}

describe('ThemeApplier', () => {
	beforeEach(() => {
		themeMock.resolvedTheme = 'light'
		document.documentElement.removeAttribute('style')
		document.documentElement.className = ''
		document.head.innerHTML = `
			<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
			<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
		`
	})

	it('writes the active light theme variables without owning the dark class', async () => {
		document.documentElement.classList.add('dark')
		renderApplier()

		await waitFor(() => {
			expect(
				document.documentElement.style.getPropertyValue('--background'),
			).toBe(colorFormatter('oklch(1 0 0)', 'hsl', '4'))
		})
		expect(document.documentElement.classList.contains('dark')).toBe(true)
	})

	it('uses next-themes resolved mode for dark values', async () => {
		themeMock.resolvedTheme = 'dark'
		renderApplier()

		await waitFor(() => {
			expect(
				document.documentElement.style.getPropertyValue('--background'),
			).toBe(colorFormatter('oklch(0 0 0)', 'hsl', '4'))
		})
	})

	it('clears stale inline variables when a later theme omits them', async () => {
		const store = renderApplier()

		await waitFor(() => {
			expect(document.documentElement.style.getPropertyValue('--chart-5')).toBe(
				colorFormatter('oklch(0.6405 0.0584 165.7737)', 'hsl', '4'),
			)
		})

		const current = store.get(themeStateAtom)
		const nextStyles = structuredClone(current.styles)
		delete (nextStyles.light as Partial<typeof nextStyles.light>)['chart-5']
		store.set(themeStateAtom, {
			...current,
			styles: nextStyles,
		})

		await waitFor(() => {
			expect(document.documentElement.style.getPropertyValue('--chart-5')).toBe(
				'',
			)
		})
	})

	it('syncs theme-color meta tags to the active background', async () => {
		renderApplier()

		await waitFor(() => {
			const metas = Array.from(
				document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
			)
			expect(metas.map((meta) => meta.content)).toEqual([
				'oklch(1 0 0)',
				'oklch(1 0 0)',
			])
		})
	})
})
