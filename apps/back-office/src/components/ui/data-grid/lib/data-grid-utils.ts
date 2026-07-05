import {
	format as dateFnsFormat,
	formatDistance,
	formatDistanceToNow,
	formatRelative,
	isValid,
	parseISO,
} from 'date-fns'

export interface FormatterOptions {
	locale?: string
	fallback?: string
}

export interface CurrencyFormatterOptions extends FormatterOptions {
	currency?: string
	notation?: 'standard' | 'compact'
	minimumFractionDigits?: number
	maximumFractionDigits?: number
}

export interface DateFormatterOptions extends FormatterOptions {
	format?:
		| 'short'
		| 'medium'
		| 'long'
		| 'full'
		| 'relative'
		| 'distance'
		| string
	includeTime?: boolean
	referenceDate?: Date
}

export interface NumberFormatterOptions extends FormatterOptions {
	notation?: 'standard' | 'compact' | 'scientific' | 'engineering'
	minimumFractionDigits?: number
	maximumFractionDigits?: number
}

export interface PercentFormatterOptions extends FormatterOptions {
	minimumFractionDigits?: number
	maximumFractionDigits?: number
}

function normalizeCurrencyCode(value: string | undefined): string | undefined {
	if (!value) return undefined
	const normalized = value.trim().toUpperCase()
	return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}

export const formatters = {
	currency: (
		value: number | string | null | undefined,
		options: CurrencyFormatterOptions = {},
	): string => {
		const {
			locale = 'en-US',
			currency = 'USD',
			notation = 'standard',
			minimumFractionDigits = 2,
			maximumFractionDigits = 2,
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback
		const num = typeof value === 'string' ? Number.parseFloat(value) : value
		if (Number.isNaN(num)) return fallback
		const safeCurrency = normalizeCurrencyCode(currency) ?? 'USD'

		try {
			return new Intl.NumberFormat(locale, {
				style: 'currency',
				currency: safeCurrency,
				notation,
				minimumFractionDigits,
				maximumFractionDigits,
			}).format(num)
		} catch {
			return new Intl.NumberFormat(locale, {
				notation,
				minimumFractionDigits,
				maximumFractionDigits,
			}).format(num)
		}
	},

	number: (
		value: number | string | null | undefined,
		options: NumberFormatterOptions = {},
	): string => {
		const {
			locale = 'en-US',
			notation = 'standard',
			minimumFractionDigits,
			maximumFractionDigits,
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback
		const num = typeof value === 'string' ? Number.parseFloat(value) : value
		if (Number.isNaN(num)) return fallback

		return new Intl.NumberFormat(locale, {
			notation,
			minimumFractionDigits,
			maximumFractionDigits,
		}).format(num)
	},

	percent: (
		value: number | string | null | undefined,
		options: PercentFormatterOptions = {},
	): string => {
		const {
			locale = 'en-US',
			minimumFractionDigits = 0,
			maximumFractionDigits = 2,
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback
		const num = typeof value === 'string' ? Number.parseFloat(value) : value
		if (Number.isNaN(num)) return fallback

		return new Intl.NumberFormat(locale, {
			style: 'percent',
			minimumFractionDigits,
			maximumFractionDigits,
		}).format(num / 100)
	},

	date: (
		value: Date | string | number | null | undefined,
		options: DateFormatterOptions = {},
	): string => {
		const {
			format = 'medium',
			includeTime = false,
			referenceDate = new Date(),
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback

		let date: Date
		if (value instanceof Date) {
			date = value
		} else if (typeof value === 'string') {
			date = parseISO(value)
			if (!isValid(date)) {
				date = new Date(value)
			}
		} else {
			date = new Date(value)
		}

		if (!isValid(date)) return fallback

		const formatPatterns: Record<string, string> = {
			short: includeTime ? 'M/d/yy h:mm a' : 'M/d/yy',
			medium: includeTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy',
			long: includeTime ? 'MMMM d, yyyy h:mm a' : 'MMMM d, yyyy',
			full: includeTime ? 'EEEE, MMMM d, yyyy h:mm:ss a' : 'EEEE, MMMM d, yyyy',
		}

		if (format === 'relative') {
			return formatRelative(date, referenceDate)
		}

		if (format === 'distance') {
			return formatDistanceToNow(date, { addSuffix: true })
		}

		const pattern = formatPatterns[format] ?? format
		return dateFnsFormat(date, pattern)
	},

	dateDistance: (
		value: Date | string | number | null | undefined,
		options: {
			referenceDate?: Date
			addSuffix?: boolean
			fallback?: string
		} = {},
	): string => {
		const {
			referenceDate = new Date(),
			addSuffix = true,
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback

		let date: Date
		if (value instanceof Date) {
			date = value
		} else if (typeof value === 'string') {
			date = parseISO(value)
			if (!isValid(date)) date = new Date(value)
		} else {
			date = new Date(value)
		}

		if (!isValid(date)) return fallback

		return formatDistance(date, referenceDate, { addSuffix })
	},

	dateRelative: (
		value: Date | string | number | null | undefined,
		options: { referenceDate?: Date; fallback?: string } = {},
	): string => {
		const { referenceDate = new Date(), fallback = '-' } = options

		if (value == null || value === '') return fallback

		let date: Date
		if (value instanceof Date) {
			date = value
		} else if (typeof value === 'string') {
			date = parseISO(value)
			if (!isValid(date)) date = new Date(value)
		} else {
			date = new Date(value)
		}

		if (!isValid(date)) return fallback

		return formatRelative(date, referenceDate)
	},

	boolean: (
		value: boolean | string | null | undefined,
		options: {
			trueLabel?: string
			falseLabel?: string
			fallback?: string
		} = {},
	): string => {
		const { trueLabel = 'Yes', falseLabel = 'No', fallback = '-' } = options

		if (value == null) return fallback
		const bool = typeof value === 'string' ? value === 'true' : Boolean(value)
		return bool ? trueLabel : falseLabel
	},

	truncate: (
		value: string | null | undefined,
		options: { length?: number; suffix?: string; fallback?: string } = {},
	): string => {
		const { length = 50, suffix = '...', fallback = '-' } = options

		if (value == null || value === '') return fallback
		if (value.length <= length) return value
		return value.slice(0, length - suffix.length) + suffix
	},

	bytes: (
		value: number | string | null | undefined,
		options: FormatterOptions = {},
	): string => {
		const { fallback = '-' } = options

		if (value == null || value === '') return fallback
		const num = typeof value === 'string' ? Number.parseFloat(value) : value
		if (Number.isNaN(num)) return fallback

		const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
		let unitIndex = 0
		let size = num

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}

		return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
	},

	mask: (
		value: string | number | null | undefined,
		options: {
			char?: string
			showFirst?: number
			showLast?: number
			preset?: 'creditCard' | 'ssn' | 'phone' | 'email' | 'custom'
			pattern?: string
			fallback?: string
		} = {},
	): string => {
		const {
			char = '*',
			showFirst = 0,
			showLast = 4,
			preset,
			pattern,
			fallback = '-',
		} = options

		if (value == null || value === '') return fallback
		const str = String(value)

		if (preset) {
			switch (preset) {
				case 'creditCard': {
					const digits = str.replace(/\D/g, '')
					if (digits.length < 4) return fallback
					const last4 = digits.slice(-4)
					return `${char.repeat(4)} ${char.repeat(4)} ${char.repeat(4)} ${last4}`
				}
				case 'ssn': {
					const digits = str.replace(/\D/g, '')
					if (digits.length < 4) return fallback
					const last4 = digits.slice(-4)
					return `${char.repeat(3)}-${char.repeat(2)}-${last4}`
				}
				case 'phone': {
					const digits = str.replace(/\D/g, '')
					if (digits.length < 4) return fallback
					const last4 = digits.slice(-4)
					return `(${char.repeat(3)}) ${char.repeat(3)}-${last4}`
				}
				case 'email': {
					const atIndex = str.indexOf('@')
					if (atIndex <= 0) return fallback
					const localPart = str.slice(0, atIndex)
					const domain = str.slice(atIndex)
					const first = localPart[0]
					const masked = char.repeat(Math.min(localPart.length - 1, 4))
					return `${first}${masked}${domain}`
				}
				default:
					break
			}
		}

		if (pattern) {
			let result = ''
			let valueIndex = 0
			for (const patternChar of pattern) {
				if (patternChar === '#') {
					result += valueIndex < str.length ? char : ''
					valueIndex++
				} else {
					result += patternChar
				}
			}
			return result
		}

		if (str.length <= showFirst + showLast) {
			return str
		}

		const first = str.slice(0, showFirst)
		const last = str.slice(-showLast)
		const middleLength = str.length - showFirst - showLast
		const masked = char.repeat(Math.min(middleLength, 8))

		return `${first}${masked}${last}`
	},
}
