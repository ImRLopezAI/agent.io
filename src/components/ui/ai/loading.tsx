import { LoaderIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { SPINNER_VERBS } from '../ai-elements/spinners'
import { AiRobotixLogo } from '../logo'
import { ShimmeringText } from '../unlumen-ui/shimmering-text'

/**
 * Returns a verb from `SPINNER_VERBS` that rotates every `duration` ms.
 * Shared between the full-bubble `SpinnerVerbsShimmer` and inline footer
 * indicators so the same verb pool drives every "thinking…" affordance.
 */
export function useCyclingVerb(duration = 3000) {
	const [currentIndex, setCurrentIndex] = useState(0)
	useEffect(() => {
		const interval = setInterval(() => {
			const pickRandomVerb = Math.floor(Math.random() * SPINNER_VERBS.length)
			setCurrentIndex(pickRandomVerb)
		}, duration)
		return () => clearInterval(interval)
	}, [duration])
	return { index: currentIndex, verb: SPINNER_VERBS[currentIndex] ?? '' }
}

interface SpinnerVerbsShimmerProps {
	duration?: number
}
export function SpinnerVerbsShimmer({
	duration = 3000,
}: SpinnerVerbsShimmerProps) {
	const { index, verb } = useCyclingVerb(duration)

	return (
		<div className='flex items-center'>
			<AiRobotixLogo className='size-10' />
			<AnimatePresence mode='wait'>
				<motion.div
					key={index}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ duration: 0.3 }}
				>
					<ShimmeringText text={verb} />
				</motion.div>
			</AnimatePresence>
		</div>
	)
}

export function StreamingFooterIndicator() {
	const { verb, index } = useCyclingVerb(2_000)
	return (
		<div className='-mt-1 flex items-center gap-2 text-muted-foreground text-xs'>
			<LoaderIcon className='size-3 animate-spin' />
			<AnimatePresence mode='wait'>
				<motion.div
					key={index}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ duration: 0.3 }}
				>
					<ShimmeringText text={verb} />
				</motion.div>
			</AnimatePresence>
		</div>
	)
}
