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
