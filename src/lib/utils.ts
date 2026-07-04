import { type ClassValue, clsx, twMerge } from 'cnfast'

export { toast } from 'sonner'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
