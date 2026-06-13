// Module augmentation for `@tanstack/hotkeys` `HotkeyMeta` so the data-grid
// keyboard registry can carry name/description/group on every registration.
// The help dialog reads these directly via `useHotkeyRegistrations()`.
//
// We declare the augmentation against `@tanstack/react-hotkeys` (which
// re-exports `*` from `@tanstack/hotkeys`) because `@tanstack/hotkeys` is not
// installed as a direct dependency in this workspace. TypeScript resolves
// the augmentation to the same `HotkeyMeta` interface either way.
import '@tanstack/react-hotkeys'

declare module '@tanstack/react-hotkeys' {
	interface HotkeyMeta {
		name?: string
		description?: string
		group?:
			| 'Navigation'
			| 'Selection'
			| 'Editing'
			| 'Clipboard'
			| 'Search'
			| 'History'
			| 'Misc'
	}
}
