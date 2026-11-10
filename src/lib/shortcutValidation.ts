const modifiers = ["command", "control", "option", "shift"];
const aliases: Record<string, string> = {
	cmd: "command", "⌘": "command", "⌃": "control", "⌥": "option", "⇧": "shift",
};

export function canonicalShortcut(value: string): string {
	const tokens = value.split("+").map(t => aliases[t.trim().toLowerCase()] ?? t.trim().toLowerCase()).filter(Boolean);
	const unique = [...new Set(tokens)];
	return [...modifiers.filter(m => unique.includes(m)), ...unique.filter(t => !modifiers.includes(t))].join("+");
}

export function shortcutError(value: string): string | null {
	const tokens = canonicalShortcut(value).split("+");
	const keys = tokens.filter(t => !modifiers.includes(t));
	if (!tokens.some(t => ["command", "control", "option"].includes(t))) return "Include Command, Control, or Option.";
	if (keys.length !== 1 || !/^(space|return|up|down|left|right|[a-z0-9])$/.test(keys[0])) return "Choose a letter, number, Space, Return, or arrow key.";
	if (canonicalShortcut(value) === "command+q" || canonicalShortcut(value) === "command+space") {
		// Command-Space remains a supported launcher shortcut; Command-Q is reserved.
		if (keys[0] === "q") return "Command-Q is reserved for quitting apps.";
	}
	return null;
}

export function launcherShortcut(value: string): string {
	return ["command", "control", "option"].includes(value) ? `${value}+space` : canonicalShortcut(value);
}
