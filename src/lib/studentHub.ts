import { makeAutoObservable, runInAction } from "mobx";
import { Linking } from "react-native";
import { v4 as uuid } from "uuid";
import { solNative } from "./SolNative";
import type {
	HubCommand,
	QuickCommandDraft,
	QuickCommandKind,
} from "./quickCommands";

export type HubTask = {
	id: string;
	title: string;
	details: string;
	course: string;
	dueDate?: string | null;
	includesDueTime: boolean;
	isCompleted: boolean;
	url: string;
};
export type HubCountdown = {
	id: string;
	title: string;
	date: string;
	nextOccurrence: string;
	daysRemaining: number;
	isArchived: boolean;
	repeatsYearly: boolean;
	url: string;
};
export type HubCommandPreview = {
	id: string;
	success: boolean;
	kind: "todo" | "countdown";
	title?: string;
	details?: string;
	course?: string;
	courseID?: string;
	dueDate?: string;
	includesDueTime?: boolean;
	repeatsYearly?: boolean;
	error?: string;
};
export type HubSnapshot = {
	schemaVersion: number;
	generatedAt: string;
	bridgeToken: string;
	tasks: HubTask[];
	countdowns: HubCountdown[];
	lastRequest?: { id: string; success: boolean; error?: string };
	lastPreview?: HubCommandPreview;
	commands?: HubCommand[];
};
export function hubURL(route: string, values: Record<string, string>): string {
	return `studenthub://${route}?${Object.entries(values)
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join("&")}`;
}

export function parseHubDate(value: string): Date | null {
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	const date = dateOnly
		? new Date(
				Number(dateOnly[1]),
				Number(dateOnly[2]) - 1,
				Number(dateOnly[3]),
			)
		: new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	if (
		dateOnly &&
		(date.getFullYear() !== Number(dateOnly[1]) ||
			date.getMonth() !== Number(dateOnly[2]) - 1 ||
			date.getDate() !== Number(dateOnly[3]))
	)
		return null;
	return date;
}
function dayOrdinal(date: Date): number {
	return (
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
	);
}
export function formatHubTaskDue(
	task: Pick<HubTask, "dueDate" | "includesDueTime">,
	now = new Date(),
): string {
	const date = task.dueDate ? parseHubDate(task.dueDate) : null;
	if (!date) return "No deadline";
	const difference = dayOrdinal(date) - dayOrdinal(now);
	const day =
		difference === 0
			? "Today"
			: difference === 1
				? "Tomorrow"
				: difference === -1
					? "Yesterday"
					: date.toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
							...(date.getFullYear() !== now.getFullYear()
								? { year: "numeric" }
								: {}),
						});
	return task.includesDueTime
		? `${day} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
		: day;
}
export function countdownDays(item: HubCountdown, now = new Date()): number {
	const date = parseHubDate(item.nextOccurrence);
	if (!date) return item.daysRemaining;
	let target = date;
	if (
		item.repeatsYearly &&
		!item.isArchived &&
		dayOrdinal(target) < dayOrdinal(now)
	) {
		const month = target.getMonth();
		const day = target.getDate();
		const occurrence = (year: number) =>
			new Date(
				year,
				month,
				Math.min(day, new Date(year, month + 1, 0).getDate()),
			);
		target = occurrence(now.getFullYear());
		if (dayOrdinal(target) < dayOrdinal(now))
			target = occurrence(now.getFullYear() + 1);
	}
	return dayOrdinal(target) - dayOrdinal(now);
}

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
function localLink(value: unknown): value is string {
	return typeof value === "string" && /^studenthub:\/\//i.test(value);
}
export function decodeHubSnapshot(input: unknown): HubSnapshot {
	if (
		!record(input) ||
		input.schemaVersion !== 1 ||
		typeof input.generatedAt !== "string" ||
		!parseHubDate(input.generatedAt) ||
		typeof input.bridgeToken !== "string" ||
		!input.bridgeToken ||
		!Array.isArray(input.tasks) ||
		!Array.isArray(input.countdowns)
	)
		throw new Error("Unsupported Student Hub snapshot");
	for (const task of input.tasks) {
		if (
			!record(task) ||
			![task.id, task.title, task.details, task.course].every(
				(value) => typeof value === "string",
			) ||
			typeof task.includesDueTime !== "boolean" ||
			typeof task.isCompleted !== "boolean" ||
			!localLink(task.url) ||
			(task.dueDate != null &&
				(typeof task.dueDate !== "string" || !parseHubDate(task.dueDate)))
		)
			throw new Error("Invalid Student Hub task");
	}
	for (const item of input.countdowns) {
		if (
			!record(item) ||
			![item.id, item.title].every((value) => typeof value === "string") ||
			typeof item.date !== "string" ||
			!parseHubDate(item.date) ||
			typeof item.nextOccurrence !== "string" ||
			!parseHubDate(item.nextOccurrence) ||
			typeof item.daysRemaining !== "number" ||
			!Number.isFinite(item.daysRemaining) ||
			typeof item.isArchived !== "boolean" ||
			typeof item.repeatsYearly !== "boolean" ||
			!localLink(item.url)
		)
			throw new Error("Invalid Student Hub countdown");
	}
	if (
		input.lastRequest != null &&
		(!record(input.lastRequest) ||
			typeof input.lastRequest.id !== "string" ||
			typeof input.lastRequest.success !== "boolean" ||
			(input.lastRequest.error != null &&
				typeof input.lastRequest.error !== "string"))
	)
		throw new Error("Invalid Student Hub response");
	if (
		input.commands != null &&
		(!Array.isArray(input.commands) ||
			input.commands.some(
				(command) =>
					!record(command) ||
					![
						command.id,
						command.command,
						command.usage,
						command.detail,
						command.insertionText,
					].every((value) => typeof value === "string") ||
					typeof command.takesArgument !== "boolean" ||
					!/^\/[a-z]+$/i.test(command.command as string) ||
					(command.aliases != null &&
						(!Array.isArray(command.aliases) ||
							command.aliases.some(
								(value) =>
									typeof value !== "string" || !/^\/[a-z]+$/i.test(value),
							))),
			))
	) {
		throw new Error("Invalid Student Hub commands");
	}
	if (input.lastPreview != null) {
		const preview = input.lastPreview;
		if (
			!record(preview) ||
			typeof preview.id !== "string" ||
			typeof preview.success !== "boolean" ||
			!["todo", "countdown"].includes(preview.kind as string) ||
			(preview.error != null && typeof preview.error !== "string") ||
			(preview.courseID != null && typeof preview.courseID !== "string") ||
			(preview.success &&
				(typeof preview.title !== "string" ||
					typeof preview.details !== "string" ||
					typeof preview.course !== "string" ||
					typeof preview.dueDate !== "string" ||
					!parseHubDate(preview.dueDate) ||
					typeof preview.includesDueTime !== "boolean" ||
					typeof preview.repeatsYearly !== "boolean"))
		)
			throw new Error("Invalid Student Hub preview");
	}
	return input as HubSnapshot;
}

export class StudentHub {
	snapshot: HubSnapshot | null = null;
	error = "";
	pendingID = "";
	editing = false;
	commandDraft: QuickCommandDraft | null = null;
	previewID = "";
	now = Date.now();
	private lastJSON = "";
	private snapshotReadError = false;
	private timer: ReturnType<typeof setInterval> | undefined;
	private timeout: ReturnType<typeof setTimeout> | undefined;
	private pendingResolve: ((success: boolean) => void) | undefined;
	private previewResolve:
		| ((preview: HubCommandPreview | null) => void)
		| undefined;
	private previewTimeout: ReturnType<typeof setTimeout> | undefined;
	constructor(private requestTimeoutMs = 30000) {
		makeAutoObservable(this, {}, { autoBind: true });
	}
	get tasks() {
		return this.snapshot?.tasks ?? [];
	}
	get commands() {
		return this.snapshot?.commands ?? [];
	}
	get countdowns() {
		const today = new Date(this.now);
		return (
			this.snapshot?.countdowns.filter(
				(item) => !item.isArchived && countdownDays(item, today) >= 0,
			) ?? []
		);
	}
	get snapshotAgeMinutes() {
		return this.snapshot
			? Math.max(
					0,
					Math.floor(
						(this.now - new Date(this.snapshot.generatedAt).getTime()) / 60000,
					),
				)
			: 0;
	}
	private finishRequest(success: boolean, error = "") {
		const resolve = this.pendingResolve;
		this.pendingID = "";
		this.pendingResolve = undefined;
		if (this.timeout != null) clearTimeout(this.timeout);
		this.timeout = undefined;
		this.error = error;
		resolve?.(success);
	}
	private finishPreview(preview: HubCommandPreview | null) {
		const resolve = this.previewResolve;
		this.previewResolve = undefined;
		this.previewID = "";
		if (this.previewTimeout != null) clearTimeout(this.previewTimeout);
		this.previewTimeout = undefined;
		resolve?.(preview);
	}
	openDraft(kind: QuickCommandKind, text = "") {
		if (this.pendingID) return;
		this.commandDraft = { kind, text };
		this.editing = true;
		this.error = "";
	}
	closeDraft() {
		if (this.pendingID) return;
		this.finishPreview(null);
		this.commandDraft = null;
		this.editing = false;
	}
	refresh() {
		this.now = Math.floor(Date.now() / 60000) * 60000;
		const path = `/Users/${solNative.userName()}/Library/Application Support/StudentHub/Integrations/sol.json`;
		try {
			if (!solNative.exists(path)) {
				this.snapshot = null;
				this.lastJSON = "";
				return;
			}
			const raw = solNative.readFile(path);
			if (!raw) {
				this.snapshot = null;
				this.lastJSON = "";
				return;
			}
			if (raw !== this.lastJSON) {
				this.snapshot = decodeHubSnapshot(JSON.parse(raw));
				this.lastJSON = raw;
			}
			if (this.snapshotReadError) {
				this.error = "";
				this.snapshotReadError = false;
			}
			const preview = this.snapshot?.lastPreview;
			if (
				this.previewID &&
				preview?.id.toLowerCase() === this.previewID.toLowerCase()
			) {
				this.finishPreview(preview);
			}
			const response = this.snapshot?.lastRequest;
			if (
				this.pendingID &&
				response?.id.toLowerCase() === this.pendingID.toLowerCase()
			) {
				this.finishRequest(
					response.success,
					response.success
						? ""
						: (response.error ?? "Student Hub could not save this change."),
				);
			}
		} catch {
			this.snapshotReadError = true;
			this.error =
				"Could not read Student Hub. Showing the last snapshot; open it and try Refresh.";
		}
	}
	async requestRefresh() {
		this.refresh();
		try {
			await solNative.openStudentHubURL(
				this.snapshot?.bridgeToken
					? hubURL("sol-refresh", { token: this.snapshot.bridgeToken })
					: "studenthub://tasks",
			);
			this.refresh();
		} catch {
			runInAction(() => {
				this.error = "Could not refresh Student Hub.";
			});
		}
	}
	start() {
		this.refresh();
		if (this.timer == null) this.timer = setInterval(this.refresh, 800);
	}
	stop() {
		if (this.timer != null) clearInterval(this.timer);
		this.timer = undefined;
		this.finishPreview(null);
		if (this.pendingID)
			this.finishRequest(
				false,
				"Change not confirmed. Refresh Student Hub before trying again.",
			);
	}
	async capture(text: string) {
		if (!text.trim() || text.length > 10000) {
			this.error = "Enter a task command up to 10,000 characters.";
			return;
		}
		try {
			await Linking.openURL(hubURL("quick-command", { text }));
		} catch {
			runInAction(() => {
				this.error = "Could not open Student Hub.";
			});
		}
	}
	async mutate(
		action:
			| "create"
			| "capture"
			| "create-countdown"
			| "update"
			| "complete"
			| "delete",
		task: HubTask | null,
		values: Record<string, string> = {},
	): Promise<boolean> {
		if (this.pendingID) return false;
		this.refresh();
		if (!this.snapshot?.bridgeToken) {
			this.error = "Open Student Hub to connect first.";
			return false;
		}
		if (
			task &&
			!this.tasks.some(
				(item) => item.id.toLowerCase() === task.id.toLowerCase(),
			)
		) {
			this.error = "This task no longer exists. Refresh and try again.";
			return false;
		}
		const requestID = uuid();
		this.pendingID = requestID;
		this.error = "";
		const confirmation = new Promise<boolean>((resolve) => {
			this.pendingResolve = resolve;
		});
		this.timeout = setTimeout(
			() =>
				runInAction(() => {
					if (this.pendingID === requestID)
						this.finishRequest(
							false,
							"Student Hub has not confirmed the change. Refresh before trying again.",
						);
				}),
			this.requestTimeoutMs,
		);
		try {
			await solNative.openStudentHubURL(
				hubURL("sol-task", {
					...values,
					action,
					...(task ? { id: task.id } : {}),
					requestID,
					token: this.snapshot.bridgeToken,
				}),
			);
			this.refresh();
		} catch {
			runInAction(() => {
				if (this.pendingID === requestID)
					this.finishRequest(
						false,
						"Could not send the change to Student Hub.",
					);
			});
		}
		return confirmation;
	}
	async previewCommand(text: string): Promise<HubCommandPreview | null> {
		this.finishPreview(null);
		this.refresh();
		if (!this.snapshot?.bridgeToken || !text.trim() || text.length > 10000)
			return null;
		const requestID = uuid();
		this.previewID = requestID;
		const result = new Promise<HubCommandPreview | null>((resolve) => {
			this.previewResolve = resolve;
		});
		this.previewTimeout = setTimeout(
			() =>
				runInAction(() => {
					if (this.previewID === requestID) this.finishPreview(null);
				}),
			this.requestTimeoutMs,
		);
		try {
			await solNative.openStudentHubURL(
				hubURL("sol-parse", {
					text,
					requestID,
					token: this.snapshot.bridgeToken,
				}),
			);
			this.refresh();
		} catch {
			runInAction(() => {
				if (this.previewID === requestID) this.finishPreview(null);
			});
		}
		return result;
	}
}
export const studentHub = new StudentHub();
