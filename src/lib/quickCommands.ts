export type QuickCommandKind = "todo" | "capture" | "countdown";
export type QuickCommandDraft = { kind: QuickCommandKind; text: string };
export type HubCommand = {
	id: string;
	command: string;
	usage: string;
	detail: string;
	takesArgument: boolean;
	insertionText: string;
	aliases?: string[];
};

export const quickCommandLabels: Record<QuickCommandKind, string> = {
	todo: "Add todo",
	capture: "Save to scratchpad",
	countdown: "Add countdown",
};

export function parseQuickCommand(query: string): QuickCommandDraft | null {
	const match = /^\/(todo|capture|countdown)(?:\s+([\s\S]*))?$/i.exec(
		query.trim(),
	);
	return match
		? {
				kind: match[1].toLowerCase() as QuickCommandKind,
				text: match[2]?.trim() ?? "",
			}
		: null;
}

export function suggestedQuickCommands(query: string): QuickCommandKind[] {
	const prefix = query.trim().toLowerCase();
	if (!/^\/[a-z]*$/.test(prefix)) return [];
	return (Object.keys(quickCommandLabels) as QuickCommandKind[]).filter(
		(kind) => `/${kind}`.startsWith(prefix),
	);
}

export function findHubCommand(
	query: string,
	commands: HubCommand[],
): HubCommand | undefined {
	const name = query.trim().split(/\s/, 1)[0].toLowerCase();
	return commands.find((item) =>
		[item.command, ...(item.aliases ?? [])].some(
			(alias) => alias.toLowerCase() === name,
		),
	);
}

export function matchingHubCommands(
	query: string,
	commands: HubCommand[],
): HubCommand[] {
	const prefix = query.trim().toLowerCase();
	if (!prefix.startsWith("/")) return [];
	return commands.filter(
		(item) =>
			[item.command, ...(item.aliases ?? [])].some((name) =>
				name.toLowerCase().startsWith(prefix),
			) || item.detail.toLowerCase().includes(prefix.slice(1)),
	);
}

type CommandItem = {
	id: string;
	name: string;
	subName?: string;
	icon: string;
	preventClose: true;
	callback: () => void;
};

type CommandActions = {
	complete: (text: string) => void;
	openDraft: (kind: QuickCommandKind, text: string) => void;
	handoff: (text: string) => void;
};

// These callbacks are also used by the selected result's Enter handler. A
// suggestion completes the input; only an entered command can perform an action.
export function quickCommandItems(
	query: string,
	commands: HubCommand[],
	actions: CommandActions,
): CommandItem[] | null {
	const command = parseQuickCommand(query);
	if (command?.text)
		return [
			{
				id: `quick-command-${command.kind}`,
				name: `${quickCommandLabels[command.kind]}: ${command.text}`,
				icon:
					command.kind === "todo"
						? "☑"
						: command.kind === "capture"
							? "✎"
							: "◷",
				preventClose: true,
				callback: () => actions.openDraft(command.kind, command.text),
			},
		];
	if (query.trim().startsWith("/") && commands.length) {
		const exact = findHubCommand(query, commands);
		if (exact && (!exact.takesArgument || /^\S+\s+\S/.test(query.trim())))
			return [
				{
					id: `hub-command-${exact.id}`,
					name: query.trim(),
					subName: exact.detail,
					icon: "⌘",
					preventClose: true,
					callback: () => actions.handoff(query),
				},
			];
		return matchingHubCommands(query, commands).map((item) => ({
			id: `hub-command-${item.id}`,
			name: item.usage,
			subName: item.detail,
			icon: "⌘",
			preventClose: true,
			callback: () => actions.complete(item.insertionText),
		}));
	}
	const suggestions = suggestedQuickCommands(query);
	if (!suggestions.length) return null;
	return suggestions.map((kind) => ({
		id: `quick-command-${kind}`,
		name: `/${kind} — ${quickCommandLabels[kind]}`,
		icon: "⌘",
		preventClose: true,
		callback: () => actions.complete(`/${kind} `),
	}));
}
