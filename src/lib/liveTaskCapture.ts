import { makeAutoObservable, runInAction } from "mobx";
import type { HubCommandPreview } from "./studentHub";

export type LiveTaskCaptureBridge = {
	previewCommand: (text: string) => Promise<HubCommandPreview | null>;
	mutate: (
		action: "create",
		task: null,
		values: Record<string, string>,
	) => Promise<boolean>;
	error: string;
};

/** Only opt in explicit todos or plausible prose; normal launcher searches stay available. */
export function taskCaptureText(query: string): string | null {
	const trimmed = query.trim();
	if (!trimmed) return null;
	const explicit = /^\/todo(?:\s+([\s\S]*))?$/i.exec(trimmed);
	let text: string;
	if (explicit) {
		if (!explicit[1]?.trim()) return null;
		text = `/todo ${explicit[1].trim()}`;
	} else {
		if (
			trimmed.startsWith("/") ||
			/^define(?:\s|$)/i.test(trimmed) ||
			/^(?:[a-z][\w+.-]*:\/\/|www\.)/i.test(trimmed) ||
			(!/\s/.test(trimmed) &&
				(trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0) < 2)
		)
			return null;
		text = `/todo ${trimmed}`;
	}
	return text.length <= 10_000 ? text : null;
}

type PreviewRequest = {
	generation: number;
	promise: Promise<HubCommandPreview | null>;
	resolve: (preview: HubCommandPreview | null) => void;
};

function usablePreview(
	preview: HubCommandPreview | null,
): preview is HubCommandPreview & { title: string; dueDate: string } {
	return !!(
		preview?.success &&
		preview.kind === "todo" &&
		typeof preview.title === "string" &&
		preview.title.trim() &&
		typeof preview.dueDate === "string" &&
		Number.isFinite(Date.parse(preview.dueDate))
	);
}

export class LiveTaskCapture {
	query = "";
	text: string | null = null;
	preview: HubCommandPreview | null = null;
	loading = false;
	saving = false;
	error = "";
	private generation = 0;
	private previewGeneration = -1;
	private savedGeneration = -1;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private request: PreviewRequest | undefined;

	constructor(
		private readonly bridge: LiveTaskCaptureBridge,
		private readonly debounceMs = 180,
	) {
		makeAutoObservable<
			this,
			| "bridge"
			| "debounceMs"
			| "generation"
			| "previewGeneration"
			| "savedGeneration"
			| "timer"
			| "request"
		>(
			this,
			{
				bridge: false,
				debounceMs: false,
				generation: false,
				previewGeneration: false,
				savedGeneration: false,
				timer: false,
				request: false,
			},
			{ autoBind: true },
		);
	}

	private cancelPreview() {
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = undefined;
		this.request?.resolve(null);
		this.request = undefined;
	}

	setQuery(query: string) {
		if (query === this.query) return;
		this.cancelPreview();
		this.generation += 1;
		this.query = query;
		this.text = taskCaptureText(query);
		this.preview = null;
		this.previewGeneration = -1;
		this.error = "";
		this.loading = !!this.text;
		if (!this.text) return;
		const generation = this.generation;
		const text = this.text;
		this.timer = setTimeout(() => {
			void this.loadPreview(generation, text);
		}, this.debounceMs);
	}

	private loadPreview(
		generation: number,
		text: string,
	): Promise<HubCommandPreview | null> {
		if (generation !== this.generation || text !== this.text)
			return Promise.resolve(null);
		if (this.previewGeneration === generation && usablePreview(this.preview))
			return Promise.resolve(this.preview);
		if (this.request?.generation === generation) return this.request.promise;
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = undefined;
		this.loading = true;
		this.error = "";
		let resolve!: PreviewRequest["resolve"];
		const promise = new Promise<HubCommandPreview | null>((complete) => {
			resolve = complete;
		});
		const request = { generation, promise, resolve };
		this.request = request;
		void (async () => {
			try {
				const preview = await this.bridge.previewCommand(text);
				runInAction(() => {
					if (this.request !== request || this.generation !== generation)
						return;
					this.request = undefined;
					this.loading = false;
					if (usablePreview(preview)) {
						this.preview = preview;
						this.previewGeneration = generation;
						request.resolve(preview);
					} else {
						this.error =
							preview?.error ||
							this.bridge.error ||
							"Could not preview this task. Open Student Hub and try again.";
						request.resolve(null);
					}
				});
			} catch {
				runInAction(() => {
					if (this.request !== request || this.generation !== generation)
						return;
					this.request = undefined;
					this.loading = false;
					this.error =
						this.bridge.error ||
						"Could not preview this task. Open Student Hub and try again.";
					request.resolve(null);
				});
			}
		})();
		return promise;
	}

	async submit(expectedQuery: string): Promise<boolean> {
		if (
			this.saving ||
			expectedQuery !== this.query ||
			!this.text ||
			this.savedGeneration === this.generation
		)
			return false;
		// Lock before awaiting the parser so repeated Return presses cannot queue saves.
		this.saving = true;
		this.error = "";
		const generation = this.generation;
		const text = this.text;
		try {
			const preview = await this.loadPreview(generation, text);
			if (
				generation !== this.generation ||
				expectedQuery !== this.query ||
				!usablePreview(preview)
			)
				return false;
			const success = await this.bridge.mutate("create", null, {
				text,
				title: preview.title.trim(),
				details: preview.details ?? "",
				dueDate: preview.dueDate,
				includesDueTime: String(preview.includesDueTime ?? false),
				...(preview.courseID ? { course: preview.courseID } : {}),
			});
			runInAction(() => {
				if (success) this.savedGeneration = generation;
				else if (generation === this.generation)
					this.error =
						this.bridge.error ||
						"Student Hub did not confirm this task. Refresh it before trying again.";
			});
			return success;
		} catch {
			runInAction(() => {
				if (generation === this.generation)
					this.error =
						this.bridge.error ||
						"Could not save this task. Open Student Hub and try again.";
			});
			return false;
		} finally {
			runInAction(() => {
				this.saving = false;
			});
		}
	}

	reset() {
		this.cancelPreview();
		this.generation += 1;
		this.query = "";
		this.text = null;
		this.preview = null;
		this.previewGeneration = -1;
		this.loading = false;
		this.error = "";
	}

	stop() {
		this.reset();
	}
}
