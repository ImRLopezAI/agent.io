'use client'

import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

export default function ThemeSwitch() {
	const { theme, setTheme } = useTheme()

	return (
		<Button
			size='icon'
			variant='ghost'
			className='relative'
			onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
		>
			{theme === 'light' ? <SunIcon /> : <MoonIcon />}
			<span className='sr-only'>Toggle theme</span>
		</Button>
	)
}
