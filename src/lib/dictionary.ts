// Recognition stays local and explicit so arbitrary launcher queries cannot be
// looked up accidentally. Dictionary Services receives only the requested term.
export function parseDictionaryQuery(query: string): string | null {
	const match = query.trim().match(/^define(?:\s+(.*))?$/i);
	if (!match) return null;
	const term = (match[1] ?? "").trim();
	if (term.length > 256 || /[\u0000-\u001f\u007f-\u009f]/.test(term)) return "";
	return term;
}
