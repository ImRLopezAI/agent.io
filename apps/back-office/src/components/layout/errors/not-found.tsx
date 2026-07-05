import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

export function NotFoundComponent() {
	return (
		<div className='flex min-h-screen flex-col items-center justify-center bg-to-b from-background to-secondary/10 p-4'>
			<div className='w-full max-w-3xl space-y-4 lg:space-y-8'>
				<div className='relative flex h-64 items-center justify-center overflow-hidden rounded-lg border border-primary/10 bg-primary/5 sm:h-80'>
					<div className='absolute inset-0 grid grid-cols-10 grid-rows-10 opacity-10'>
						{Array.from({ length: 100 }).map((_, i) => (
							<div
								key={i}
								className='border border-primary/30'
								style={{
									opacity: Math.random() * 0.5 + 0.5,
								}}
							/>
						))}
					</div>

					<div className='relative z-10 text-center'>
						<div className='mb-4 font-black text-8xl text-primary tracking-tighter sm:text-9xl'>
							404
						</div>
						<div className='font-medium text-foreground text-xl sm:text-2xl'>
							Page Not Found
						</div>
					</div>

					<div className='absolute right-0 bottom-0 left-0 h-1/3 bg-to-t from-background/80 to-transparent' />
				</div>

				<div className='flex- flex justify-center'>
					<Link to='/' className='group flex items-center gap-2'>
						Back to Home
						<ArrowRight />
					</Link>
				</div>
			</div>
		</div>
	)
}
