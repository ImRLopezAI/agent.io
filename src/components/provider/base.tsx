import { Toaster } from '@ui/sonner'
import { MotionConfig } from 'motion/react'
import { ThemeProvider } from 'next-themes'
import type React from 'react'

interface ProvidersProps extends React.PropsWithChildren {}

export default function Providers({ children }: ProvidersProps) {
	return (
		<MotionConfig reducedMotion='user'>
			<ThemeProvider
				attribute='class'	
				enableSystem
				enableColorScheme
				disableTransitionOnChange
				defaultTheme='light'
			>
				{children}
				<Toaster position='top-right' richColors />
			</ThemeProvider>
		</MotionConfig>
	)
}
