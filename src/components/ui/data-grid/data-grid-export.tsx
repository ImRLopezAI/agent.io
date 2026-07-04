'use client'

import type { Table } from '@tanstack/react-table'
import { cn } from 'cnfast'
import { ChevronDownIcon, DownloadIcon } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from './ui/button'
import { ButtonGroup, ButtonGroupSeparator } from './ui/button-group'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './ui/dropdown-menu'

type ExportScope = 'all' | 'filtered' | 'selected'

interface ExportColumn {
	key: string
	header: string
}

interface ExportContext<TData = unknown> {
	columns: ExportColumn[]
	rows: TData[]
	filename: string
}

interface ExportAdapter<TData = unknown> {
	id: string
	label: string
	extension: string
	mimeType: string
	export: (ctx: ExportContext<TData>) => string | Blob | Promise<string | Blob>
}

interface DataGridExportProps<TData = unknown> {
	table: Table<TData>
	className?: string
	filename?: string
	adapters?: ExportAdapter<TData>[]
	defaultAdapter?: string
	exportAllServer?: (
		extension: 'csv' | 'json' | 'xls',
		table: Table<TData>,
	) => Promise<void>
}

function downloadFile(
	content: string | Blob,
	filename: string,
	mimeType: string,
) {
	const blob =
		content instanceof Blob ? content : new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r']

function neutralizeFormulaLeader(str: string): string {
	if (str.length === 0) return str
	return FORMULA_LEADERS.includes(str[0] as string) ? `'${str}` : str
}

function escapeCSV(value: unknown): string {
	if (value == null) return ''
	const str = neutralizeFormulaLeader(String(value))
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

function escapeXml(value: unknown): string {
	if (value == null) return ''
	const raw =
		typeof value === 'string' ? neutralizeFormulaLeader(value) : String(value)
	return raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

const csvAdapter: ExportAdapter = {
	id: 'csv',
	label: 'CSV',
	extension: 'csv',
	mimeType: 'text/csv;charset=utf-8;',
	export: ({ columns, rows }) => {
		const header = columns.map((c) => escapeCSV(c.header)).join(',')
		const data = rows.map((row) => {
			const record = row as Record<string, unknown>
			return columns.map((c) => escapeCSV(record[c.key])).join(',')
		})
		return [header, ...data].join('\n')
	},
}

const jsonAdapter: ExportAdapter = {
	id: 'json',
	label: 'JSON',
	extension: 'json',
	mimeType: 'application/json;charset=utf-8;',
	export: ({ columns, rows }) => {
		const data = rows.map((row) => {
			const record = row as Record<string, unknown>
			const obj: Record<string, unknown> = {}
			for (const col of columns) {
				obj[col.key] = record[col.key]
			}
			return obj
		})
		return JSON.stringify(data, null, 2)
	},
}

const excelAdapter: ExportAdapter = {
	id: 'excel',
	label: 'Excel',
	extension: 'xls',
	mimeType: 'application/vnd.ms-excel;charset=utf-8;',
	export: ({ columns, rows }) => {
		const headerCells = columns
			.map(
				(c) =>
					`<Cell><Data ss:Type="String">${escapeXml(c.header)}</Data></Cell>`,
			)
			.join('')

		const dataRows = rows
			.map((row) => {
				const record = row as Record<string, unknown>
				const cells = columns
					.map((c) => {
						const value = record[c.key]
						const type =
							typeof value === 'number'
								? 'Number'
								: typeof value === 'boolean'
									? 'Boolean'
									: 'String'
						return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
					})
					.join('')
				return `<Row>${cells}</Row>`
			})
			.join('')

		return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Sheet1">
    <Table>
      <Row ss:StyleID="Header">${headerCells}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`
	},
}

const defaultAdapters: ExportAdapter[] = [csvAdapter, jsonAdapter, excelAdapter]

export function DataGridExport<TData = unknown>({
	table,
	className,
	filename = 'export',
	adapters = [],
	defaultAdapter = 'csv',
	exportAllServer,
}: DataGridExportProps<TData>) {
	const adapterMap = React.useMemo(
		() => new Map([...defaultAdapters, ...adapters].map((a) => [a.id, a])),
		[adapters],
	)
	const allAdapters = React.useMemo(
		() => [...defaultAdapters, ...adapters].filter((a) => adapterMap.has(a.id)),
		[adapterMap, adapters],
	)
	const initialAdapterId = React.useMemo(() => {
		const isValid = adapterMap.has(defaultAdapter)
		return isValid ? defaultAdapter : (allAdapters[0]?.id ?? 'csv')
	}, [adapterMap, defaultAdapter, allAdapters])
	const [adapterId, setAdapterId] = React.useState(initialAdapterId)

	React.useEffect(() => {
		if (!adapterMap.has(adapterId)) {
			setAdapterId(initialAdapterId)
		}
	}, [adapterId, adapterMap, initialAdapterId])

	const currentAdapter = adapterMap.get(adapterId) ?? allAdapters[0]

	const allRows = table.getCoreRowModel().rows
	const filteredRows = table.getFilteredRowModel().rows
	const selectedRows = table.getSelectedRowModel().rows

	const isFiltered = filteredRows.length !== allRows.length
	const hasSelection = selectedRows.length > 0

	const getColumns = (): ExportColumn[] => {
		const visibleColumns = table
			.getVisibleLeafColumns()
			.filter((col) => col.id !== 'select' && col.id !== 'actions')

		const sampleRow = allRows[0]?.original as
			| Record<string, unknown>
			| undefined
		if (!sampleRow) return []

		return visibleColumns
			.map((col) => {
				const colDef = col.columnDef
				const accessorKey =
					'accessorKey' in colDef ? (colDef.accessorKey as string) : null
				if (!accessorKey || !(accessorKey in sampleRow)) return null
				return {
					key: accessorKey,
					header:
						colDef.meta?.label ??
						(typeof colDef.header === 'string'
							? colDef.header
							: accessorKey.charAt(0).toUpperCase() + accessorKey.slice(1)),
				}
			})
			.filter((col): col is ExportColumn => col !== null)
	}

	const getRows = (scope: ExportScope): TData[] => {
		const rowSet =
			scope === 'selected'
				? selectedRows
				: scope === 'filtered'
					? filteredRows
					: allRows
		return rowSet.map((r) => r.original as TData)
	}

	const handleExport = async (scope: ExportScope) => {
		if (!currentAdapter) return
		const rows = getRows(scope)
		if (rows.length === 0) return

		const columns = getColumns()
		if (columns.length === 0) return

		const ctx: ExportContext<TData> = { columns, rows, filename }
		const content = await currentAdapter.export(ctx)
		const fullFilename = `${filename}.${currentAdapter.extension}`
		downloadFile(content, fullFilename, currentAdapter.mimeType)
	}

	return (
		<ButtonGroup className={cn(className)}>
			<Button variant='outline' size='sm' onClick={() => handleExport('all')}>
				<DownloadIcon className='size-3.5' />
				<span className='sr-only'>Download</span>
			</Button>
			<ButtonGroupSeparator />
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant='outline' size='sm' className='h-7'>
							{currentAdapter?.label ?? 'CSV'}
							<ChevronDownIcon className='ml-1 size-3' />
						</Button>
					}
				/>
				<DropdownMenuContent align='start'>
					{allAdapters.map((adapter) => (
						<DropdownMenuItem
							key={adapter.id}
							onClick={() => setAdapterId(adapter.id)}
						>
							{adapter.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<ButtonGroupSeparator />
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant='outline' size='sm' className='h-7 px-2'>
							<ChevronDownIcon className='size-3.5' />
						</Button>
					}
				/>
				<DropdownMenuContent align='end'>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Export Options</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => handleExport('all')}>
							All data
							<span className='ml-auto text-muted-foreground'>
								{allRows.length}
							</span>
						</DropdownMenuItem>
						{isFiltered && (
							<DropdownMenuItem onClick={() => handleExport('filtered')}>
								Filtered data
								<span className='ml-auto text-muted-foreground'>
									{filteredRows.length}
								</span>
							</DropdownMenuItem>
						)}
						{hasSelection && (
							<DropdownMenuItem onClick={() => handleExport('selected')}>
								Selected rows
								<span className='ml-auto text-muted-foreground'>
									{selectedRows.length}
								</span>
							</DropdownMenuItem>
						)}
						{exportAllServer && (
							<DropdownMenuItem
								onClick={async () => {
									toast.promise(
										exportAllServer(
											currentAdapter?.extension as 'csv' | 'json' | 'xls',
											table,
										),
										{
											loading: (
												<div className='flex items-center gap-2'>
													Exporting all data...
												</div>
											),
											success: 'All data exported successfully',
											error: 'Failed to export all data',
										},
									)
								}}
							>
								Export all server data
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	)
}

export type {
	DataGridExportProps,
	ExportAdapter,
	ExportColumn,
	ExportContext,
	ExportScope,
}
export {
	csvAdapter,
	DataGridExport as Export,
	defaultAdapters,
	excelAdapter,
	jsonAdapter,
}
