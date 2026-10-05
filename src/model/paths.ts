/** A user-selected directory must stay inside the vault. Empty means the root. */
export function vaultDirectory(input: string): string | null {
	const path = input.trim().replace(/\\/g, '/');
	if (path.startsWith('/') || /[:*?"<>|]/.test(path) || [...path].some((char) => char.charCodeAt(0) < 32)) return null;
	const parts = path.split('/').filter(Boolean);
	if (parts.some((part) => part === '..' || part === '.')) return null;
	return parts.join('/');
}

export function noteBasename(name: string): string {
	const printable = [...name].map((char) => char.charCodeAt(0) < 32 ? '-' : char).join('');
	return printable.replace(/[\\/:*?"<>|#[\]^]/g, '-').replace(/^\.+|\.+$/g, '').trim() || 'Bookmark folder';
}
