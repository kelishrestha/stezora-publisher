export function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function sqlNullable(value: string | null | undefined): string {
	return value == null ? 'NULL' : sqlString(value);
}

export function sqlUpsertSet(columns: string[], exclude: string[] = ['id']): string {
	return columns
		.filter((column) => !exclude.includes(column))
		.map((column) => `${column} = excluded.${column}`)
		.join(',\n  ');
}
