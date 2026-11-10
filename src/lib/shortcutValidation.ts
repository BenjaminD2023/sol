const modifiers = ["command", "control", "option", "shift"];
const aliases: Record<string, string> = {
	cmd: "command",
	"⌘": "command",
	"⌃": "control",
	"⌥": "option",
	"⇧": "shift",
	"↩": "return",
	"␣": "space",
	"→": "right",
	"←": "left",
	"↑": "up",
	"↓": "down",
	"\uf703": "right",
	"\uf702": "left",
	"\uf700": "up",
	"\uf701": "down",
	"\r": "return",
};

export function canonicalShortcut(value: string): string {
	const tokens = value
		.split("+")
		.map((t) => aliases[t.trim().toLowerCase()] ?? t.trim().toLowerCase())
		.filter(Boolean);
	const unique = [...new Set(tokens)];
	return [
		...modifiers.filter((m) => unique.includes(m)),
		...unique.filter((t) => !modifiers.includes(t)),
	].join("+");
}

export function shortcutError(value: string): string | null {
	const tokens = canonicalShortcut(value).split("+");
	const keys = tokens.filter((t) => !modifiers.includes(t));
	if (!tokens.some((t) => ["command", "control", "option"].includes(t)))
		return "Include Command, Control, or Option.";
	if (
		keys.length !== 1 ||
		!/^(space|return|up|down|left|right|[a-z0-9])$/.test(keys[0])
	)
		return "Choose a letter, number, Space, Return, or arrow key.";
	if (
		canonicalShortcut(value) === "command+q" ||
		canonicalShortcut(value) === "command+space"
	) {
		// Command-Space remains a supported launcher shortcut; Command-Q is reserved.
		if (keys[0] === "q") return "Command-Q is reserved for quitting apps.";
	}
	return null;
}

export function launcherShortcut(value: string): string {
	const normalized = canonicalShortcut(value);
	return ["command", "control", "option"].includes(normalized)
		? `${normalized}+space`
		: normalized;
}

export function persistedLauncherShortcut(value: unknown): string {
	if (typeof value !== "string") return "option+space";
	const normalized = launcherShortcut(value);
	return shortcutError(normalized) ? "option+space" : normalized;
}

export function hasShortcutConflict(
	shortcuts: Record<string, string>,
	launcher: string,
): boolean {
	return Object.values(shortcuts).some(
		(value) => canonicalShortcut(value) === launcherShortcut(launcher),
	);
}

export function sanitizeShortcutMap(
	shortcuts: Record<string, unknown>,
	launcher: string,
): Record<string, string> {
	const assigned = new Set([launcherShortcut(launcher)]);
	return Object.fromEntries(
		Object.entries(shortcuts).map(([id, value]) => {
			const shortcut =
				typeof value === "string" ? canonicalShortcut(value) : "";
			if (!shortcut || shortcutError(shortcut) || assigned.has(shortcut))
				return [id, ""];
			assigned.add(shortcut);
			return [id, shortcut];
		}),
	);
}
