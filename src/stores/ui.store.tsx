import { studentHub } from "lib/studentHub";
import { LiveTaskCapture, taskCaptureText } from "lib/liveTaskCapture";
import { parseQuickCommand, quickCommandItems } from "lib/quickCommands";
import * as Sentry from "@sentry/react-native";
import { Assets } from "assets";
import { Parser } from "expr-eval";
import { CONSTANTS } from "lib/constants";
import {
	fetchCurrencyConversion,
	parseCurrencyConversion,
} from "lib/conversions";
import { parseDictionaryQuery } from "lib/dictionary";
import type { EmojiSkinTone } from "lib/emojiSkinTones";
import { normalizeEmojiSkinTone } from "lib/emojiSkinTones";
import { solNative } from "lib/SolNative";
import { defaultShortcuts, normalizeShortcut } from "lib/shortcuts";
import {
	canonicalShortcut,
	launcherShortcut,
	shortcutError,
	persistedLauncherShortcut,
	hasShortcutConflict,
	sanitizeShortcutMap,
} from "lib/shortcutValidation";
import MiniSearch from "minisearch";
import {
	autorun,
	type IReactionDisposer,
	makeAutoObservable,
	reaction,
	runInAction,
	toJS,
} from "mobx";
import {
	Appearance,
	type EmitterSubscription,
	type LayoutChangeEvent,
	Linking,
	type NativeEventSubscription,
} from "react-native";
import RNRestart from "react-native-restart-newarch";
import type { IRootStore } from "store";
import { PORTABLE_KEYS, UI_PERSISTED_KEYS } from "./config";
import { createBaseItems } from "./items";
import {
	readPersistedUIState,
	writePersistedUIState,
} from "./persisted-config";
import {
	createTextTemporaryResult,
	formatExpressionResult,
	type BookmarkNode,
	getInitials,
	getSearchMatchTier,
	normalizeCalculatorQuery,
	parseTimezoneConversion,
	parseUnitConversion,
	type TemporaryResult,
	traverse,
} from "./ui.store.helpers";

const exprParser = new Parser();

let onShowListener: EmitterSubscription | undefined;
let onHideListener: EmitterSubscription | undefined;
let onFileSearchListener: EmitterSubscription | undefined;
let onHotkeyListener: EmitterSubscription | undefined;
let onAppsChangedListener: EmitterSubscription | undefined;
let appareanceListener: NativeEventSubscription | undefined;
let bookmarksDisposer: IReactionDisposer | undefined;
let configDisposer: IReactionDisposer | undefined;
let currencyTimer: ReturnType<typeof setTimeout> | undefined;
let currencyController: AbortController | undefined;
let dictionaryTimer: ReturnType<typeof setTimeout> | undefined;
let dictionaryRequestId = 0;

export enum Widget {
	ONBOARDING = "ONBOARDING",
	SEARCH = "SEARCH",
	CALENDAR = "CALENDAR",
	TRANSLATION = "TRANSLATION",
	SETTINGS = "SETTINGS",
	CREATE_ITEM = "CREATE_ITEM",
	GOOGLE_MAP = "GOOGLE_MAP",
	SCRATCHPAD = "SCRATCHPAD",
	EMOJIS = "EMOJIS",
	CLIPBOARD = "CLIPBOARD",
	PROCESSES = "PROCESSES",
	FILE_SEARCH = "FILE_SEARCH",
}

export enum ItemType {
	FILE = "FILE",
	APPLICATION = "APPLICATION",
	CONFIGURATION = "CONFIGURATION",
	CUSTOM = "CUSTOM",
	USER_SCRIPT = "USER_SCRIPT",
	TEMPORARY_RESULT = "TEMPORARY_RESULT",
	BOOKMARK = "BOOKMARK",
	PREFERENCE_PANE = "PREFERENCE_PANE",
}

export enum ScratchPadColor {
	SYSTEM = "SYSTEM",
	BLUE = "BLUE",
	ORANGE = "ORANGE",
}

const minisearch = new MiniSearch({
	fields: ["name", "localizedName", "alias", "type"],
	storeFields: [
		"name",
		"localizedName",
		"icon",
		"iconName",
		"iconImage",
		"IconComponent",
		"color",
		"url",
		"preventClose",
		"type",
		"alias",
		"subName",
		"callback",
		"metaCallback",
		"isApplescript",
		"text",
		"shortcut",
		"isFavorite",
		"isRunning",
		"bookmarkFolder",
		"faviconFallback",
	],
	tokenize: (text: string) =>
		text
			.normalize("NFC")
			.toLowerCase()
			.split(/[\s.-]+/),
});

const userName = solNative.userName();
const defaultSearchFolders = [
	`/Users/${userName}/Downloads`,
	`/Users/${userName}/Documents`,
	`/Users/${userName}/Desktop`,
	`/Users/${userName}/Pictures`,
	`/Users/${userName}/Movies`,
	`/Users/${userName}/Music`,
];

export type UIStore = ReturnType<typeof createUIStore>;
type SearchEngine = "google" | "bing" | "duckduckgo" | "perplexity" | "custom";

const itemsThatShouldShowWindow = [
	"emoji_picker",
	"clipboard_manager",
	"process_manager",
	"scratchpad",
];

type RankedItem = Item & {
	score?: number;
	matchTier?: number;
};

export const createUIStore = (root: IRootStore) => {
	// Guards against spurious writes during hydrate/reload
	let isHydrating = false;
	let fileSearchRequestID = 0;
	let fileSearchTimer: ReturnType<typeof setTimeout> | undefined;
	let fileSearchDisposer: IReactionDisposer | undefined;
	let taskCaptureDisposer: IReactionDisposer | undefined;

	const getSelectionCount = (item: Pick<Item, "id" | "name">) => {
		const countById = store.frequencies[item.id];
		if (typeof countById === "number") {
			return countById;
		}

		const legacyCount = store.frequencies[item.name];
		return typeof legacyCount === "number" ? legacyCount : 0;
	};

	const getSelectionTimestamp = (item: Pick<Item, "id">) => {
		const timestamp = store.selectionTimestamps[item.id];
		return typeof timestamp === "number" ? timestamp : 0;
	};

	// ponytail: coarse relevance tier so usage history can only reorder items of
	// comparable match quality. Exact, prefix, word-prefix, substring, and fuzzy
	// matches remain separate regardless of selection history.
	const getMatchTier = (item: Pick<Item, "name" | "localizedName">) =>
		getSearchMatchTier(item, store.query);

	const compareRankedItems = (left: RankedItem, right: RankedItem) => {
		const tierDiff =
			(left.matchTier ?? getMatchTier(left)) -
			(right.matchTier ?? getMatchTier(right));
		if (tierDiff !== 0) {
			return tierDiff;
		}

		const leftCount = getSelectionCount(left);
		const rightCount = getSelectionCount(right);
		const leftWasSelected = leftCount > 0;
		const rightWasSelected = rightCount > 0;

		if (leftWasSelected !== rightWasSelected) {
			return leftWasSelected ? -1 : 1;
		}

		const scoreDiff = (right.score ?? 0) - (left.score ?? 0);
		if (scoreDiff !== 0) {
			return scoreDiff;
		}

		const timestampDiff =
			getSelectionTimestamp(right) - getSelectionTimestamp(left);
		if (timestampDiff !== 0) {
			return timestampDiff;
		}

		if (rightCount !== leftCount) {
			return rightCount - leftCount;
		}

		return left.name.localeCompare(right.name, undefined, {
			sensitivity: "base",
		});
	};

	const getPersistedUISnapshot = () => {
		const snapshot: Record<string, any> = {};
		for (const key of UI_PERSISTED_KEYS) {
			snapshot[key] = toJS((store as any)[key]);
		}
		return snapshot;
	};

	const persistToJson = () => {
		if (isHydrating) return;

		try {
			writePersistedUIState(getPersistedUISnapshot());
		} catch (e) {
			Sentry.captureException(e);
		}
	};

	const applyShortcutNormalization = (shortcuts?: Record<string, string>) => {
		return sanitizeShortcutMap(
			shortcuts ?? defaultShortcuts,
			store.globalShortcut,
		);
	};

	const hydrate = async () => {
		isHydrating = true;
		try {
			const src: Record<string, any> = (await readPersistedUIState()) ?? {};

			const hasPortableData = PORTABLE_KEYS.some(
				(key) => src[key] !== undefined,
			);

			if (Object.keys(src).length > 0) {
				runInAction(() => {
					if (src.frequencies) {
						const values = Object.values(src.frequencies);
						const maxValue = Math.max(...(values as number[]));
						if (maxValue > 100) {
							store.frequencies = Object.fromEntries(
								Object.entries(src.frequencies).map(([key, value]) => [
									key,
									Math.floor(((value as number) / maxValue) * 100),
								]),
							);
						} else {
							store.frequencies = src.frequencies;
						}
					}
					if (src.selectionTimestamps) {
						store.selectionTimestamps = src.selectionTimestamps;
					}
					// Config-backed UI state
					store.onboardingStep = src.onboardingStep ?? "v1_start";
					store.note = src.note ?? "";
					if (src.notes) {
						store.note = src.notes.reduce((acc: string, n: string) => {
							return `${acc}\n${n}`;
						}, "");
					}
					store.history = src.history ?? [];
					// Restore the last known apps so search works immediately on launch.
					// A fresh scan (store.getApps) replaces them once it completes.
					if (Array.isArray(src.apps) && store.apps.length === 0) {
						store.apps = src.apps.map((app: Item) => ({
							...app,
							isRunning: false,
						}));
					}

					// Config.json is authoritative for persisted UI state
					store.firstTranslationLanguage = src.firstTranslationLanguage ?? "en";
					store.secondTranslationLanguage =
						src.secondTranslationLanguage ?? "de";
					store.thirdTranslationLanguage = src.thirdTranslationLanguage ?? null;
					store.customItems = src.customItems ?? [];
					store.globalShortcut = persistedLauncherShortcut(src.globalShortcut);
					store.showWindowOn = src.showWindowOn ?? "screenWithFrontmost";
					store.calendarEnabled = src.calendarEnabled ?? true;
					store.showAllDayEvents = src.showAllDayEvents ?? true;
					store.launchAtLogin = src.launchAtLogin ?? true;
					store.mediaKeyForwardingEnabled =
						src.mediaKeyForwardingEnabled ?? true;
					store.showUpcomingEvent = src.showUpcomingEvent ?? true;
					store.scratchPadColor = src.scratchPadColor ?? ScratchPadColor.SYSTEM;
					store.searchFolders = src.searchFolders ?? defaultSearchFolders;
					store.searchEngine = src.searchEngine ?? "google";
					store.emojiSkinTone = normalizeEmojiSkinTone(src.emojiSkinTone);
					store.customSearchUrl =
						src.customSearchUrl ?? "https://google.com/search?q=%s";
					store.shortcuts = applyShortcutNormalization(src.shortcuts);
					store.showInAppBrowserBookMarks =
						src.showInAppBrowserBookMarks ?? true;
					store.hasDismissedGettingStarted =
						src.hasDismissedGettingStarted ?? false;
					store.hyperKeyEnabled = src.hyperKeyEnabled ?? false;
					store.disabledItemIds = src.disabledItemIds ?? [];

					// If JSON had portable data, user completed onboarding
					if (hasPortableData) {
						store.onboardingStep = "v1_completed";
					}

					if (
						store.onboardingStep !== "v1_completed" &&
						store.onboardingStep !== "v1_skipped"
					) {
						store.focusedWidget = Widget.ONBOARDING;
					}
				});

				solNative.setLaunchAtLogin(src.launchAtLogin ?? true);
				solNative.setGlobalShortcut(store.globalShortcut);
				solNative.setShowWindowOn(src.showWindowOn ?? "screenWithFrontmost");
				solNative.setMediaKeyForwardingEnabled(store.mediaKeyForwardingEnabled);
				solNative.setHyperKeyEnabled(store.hyperKeyEnabled);
				solNative.updateHotkeys(toJS(store.shortcuts));

				store.username = solNative.userName();
				store.getApps();
				store.migrateCustomItems();
			} else {
				runInAction(() => {
					store.focusedWidget = Widget.ONBOARDING;
				});
			}
		} finally {
			isHydrating = false;
		}
	};

	const reloadJsonConfig = async () => {
		isHydrating = true;
		try {
			const jsonConfig = await readPersistedUIState();
			if (!jsonConfig) return;
			runInAction(() => {
				if (jsonConfig.frequencies !== undefined)
					store.frequencies = jsonConfig.frequencies;
				if (jsonConfig.selectionTimestamps !== undefined)
					store.selectionTimestamps = jsonConfig.selectionTimestamps;
				if (jsonConfig.history !== undefined)
					store.history = jsonConfig.history;
				if (jsonConfig.note !== undefined) store.note = jsonConfig.note;
				if (jsonConfig.onboardingStep !== undefined)
					store.onboardingStep = jsonConfig.onboardingStep;
				if (jsonConfig.firstTranslationLanguage !== undefined)
					store.firstTranslationLanguage = jsonConfig.firstTranslationLanguage;
				if (jsonConfig.secondTranslationLanguage !== undefined)
					store.secondTranslationLanguage =
						jsonConfig.secondTranslationLanguage;
				if (jsonConfig.thirdTranslationLanguage !== undefined)
					store.thirdTranslationLanguage = jsonConfig.thirdTranslationLanguage;
				if (jsonConfig.globalShortcut !== undefined)
					store.globalShortcut = persistedLauncherShortcut(
						jsonConfig.globalShortcut,
					);
				if (jsonConfig.showWindowOn !== undefined)
					store.showWindowOn = jsonConfig.showWindowOn;
				if (jsonConfig.calendarEnabled !== undefined)
					store.calendarEnabled = jsonConfig.calendarEnabled;
				if (jsonConfig.showAllDayEvents !== undefined)
					store.showAllDayEvents = jsonConfig.showAllDayEvents;
				if (jsonConfig.launchAtLogin !== undefined)
					store.launchAtLogin = jsonConfig.launchAtLogin;
				if (jsonConfig.mediaKeyForwardingEnabled !== undefined)
					store.mediaKeyForwardingEnabled =
						jsonConfig.mediaKeyForwardingEnabled;
				if (jsonConfig.showUpcomingEvent !== undefined)
					store.showUpcomingEvent = jsonConfig.showUpcomingEvent;
				if (jsonConfig.scratchPadColor !== undefined)
					store.scratchPadColor = jsonConfig.scratchPadColor;
				if (jsonConfig.searchFolders !== undefined)
					store.searchFolders = jsonConfig.searchFolders;
				if (jsonConfig.searchEngine !== undefined)
					store.searchEngine = jsonConfig.searchEngine;
				store.emojiSkinTone = normalizeEmojiSkinTone(jsonConfig.emojiSkinTone);
				if (jsonConfig.customSearchUrl !== undefined)
					store.customSearchUrl = jsonConfig.customSearchUrl;
				if (jsonConfig.shortcuts !== undefined)
					store.shortcuts = applyShortcutNormalization(jsonConfig.shortcuts);
				if (jsonConfig.showInAppBrowserBookMarks !== undefined)
					store.showInAppBrowserBookMarks =
						jsonConfig.showInAppBrowserBookMarks;
				if (jsonConfig.hyperKeyEnabled !== undefined)
					store.hyperKeyEnabled = jsonConfig.hyperKeyEnabled;
				if (jsonConfig.customItems !== undefined)
					store.customItems = jsonConfig.customItems;
				if (jsonConfig.disabledItemIds !== undefined)
					store.disabledItemIds = jsonConfig.disabledItemIds;
			});
			// Re-apply native side effects
			solNative.setLaunchAtLogin(store.launchAtLogin);
			solNative.setGlobalShortcut(store.globalShortcut);
			solNative.setShowWindowOn(store.showWindowOn);
			solNative.setMediaKeyForwardingEnabled(store.mediaKeyForwardingEnabled);
			solNative.setHyperKeyEnabled(store.hyperKeyEnabled);
			solNative.updateHotkeys(toJS(store.shortcuts));
		} finally {
			isHydrating = false;
		}
	};

	const baseItems = createBaseItems(root);

	const store = makeAutoObservable({
		taskCapture: new LiveTaskCapture(studentHub),
		//    ____  _                              _     _
		//   / __ \| |                            | |   | |
		//  | |  | | |__  ___  ___ _ ____   ____ _| |__ | | ___  ___
		//  | |  | | '_ \/ __|/ _ \ '__\ \ / / _` | '_ \| |/ _ \/ __|
		//  | |__| | |_) \__ \  __/ |   \ V / (_| | |_) | |  __/\__ \
		//   \____/|_.__/|___/\___|_|    \_/ \__,_|_.__/|_|\___||___/
		username: "",
		note: "",
		isAccessibilityTrusted: false,
		calendarAuthorizationStatus: null as CalendarAuthorizationStatus | null,
		onboardingStep: "v1_start" as OnboardingStep,
		searchEngine: "google" as SearchEngine,
		emojiSkinTone: normalizeEmojiSkinTone(undefined),
		customSearchUrl: "https://google.com/search?q=%s" as string,
		globalShortcut: "option+space" as string,
		scratchpadShortcut: "command" as "command" | "option" | "none",
		clipboardManagerShortcut: "shift" as "shift" | "option" | "none",
		showWindowOn: "screenWithFrontmost" as
			| "screenWithFrontmost"
			| "screenWithCursor",
		query: "",
		selectedIndex: 0,
		focusedWidget: Widget.SEARCH,
		events: [] as INativeEvent[],
		customItems: [] as Item[],
		disabledItemIds: [] as string[],
		editingCustomItem: null as Item | null,
		apps: [] as Item[],
		isQuittingApplication: false,
		isLoading: false,
		isFileSearching: false,
		isIndexing: false,
		indexedFileResults: [] as Item[],
		translationResults: [] as string[],
		frequencies: {} as Record<string, number>,
		selectionTimestamps: {} as Record<string, number>,
		temporaryResult: null as TemporaryResult | null,
		firstTranslationLanguage: "en" as string,
		secondTranslationLanguage: "de" as string,
		thirdTranslationLanguage: null as null | string,
		calendarEnabled: true,
		showAllDayEvents: true,
		launchAtLogin: true,
		hasFullDiskAccess: false,
		bookmarks: [] as Item[],
		mediaKeyForwardingEnabled: true,
		targetHeight: 64,
		isDarkMode: Appearance.getColorScheme() === "dark",
		history: [] as string[],
		historyPointer: 0,
		showUpcomingEvent: true,
		scratchPadColor: ScratchPadColor.SYSTEM,
		searchFolders: [] as string[],
		shortcuts: defaultShortcuts as Record<string, string>,
		showInAppBrowserBookMarks: true,
		hoveredEventId: null as string | null,
		hasDismissedGettingStarted: false,
		isVisible: false,
		showKeyboardRecorder: false,
		keyboardRecorderSelectedItem: null as string | null,
		shortcutSearchMode: false,
		shortcutSearchFilter: null as string | null,
		confirmDialogShown: false,
		confirmCallback: null as (() => any) | null,
		confirmTitle: null as string | null,
		hyperKeyEnabled: false,
		//    _____                            _           _
		//   / ____|                          | |         | |
		//  | |     ___  _ __ ___  _ __  _   _| |_ ___  __| |
		//  | |    / _ \| '_ ` _ \| '_ \| | | | __/ _ \/ _` |
		//  | |___| (_) | | | | | | |_) | |_| | ||  __/ (_| |
		//   \_____\___/|_| |_| |_| .__/ \__,_|\__\___|\__,_|
		//                        | |
		//                        |_|
		get files(): Item[] {
			return store.indexedFileResults;
		},
		invalidateFileSearch: () => {
			fileSearchRequestID += 1;
			if (fileSearchTimer !== undefined) clearTimeout(fileSearchTimer);
			solNative.cancelFileSearch();
			store.indexedFileResults = [];
			store.isFileSearching = false;
		},
		runFileSearch: async (query: string) => {
			const widget = store.focusedWidget;
			if (
				!query.trim() ||
				!store.isVisible ||
				(widget !== Widget.FILE_SEARCH && widget !== Widget.SEARCH) ||
				(widget === Widget.SEARCH && (query.trim().length < 2 || query.trim().startsWith("/")))
			)
				return;
			const requestID = ++fileSearchRequestID;
			store.isFileSearching = true;
			try {
				const results = await solNative.searchFiles(
					query,
					toJS(store.searchFolders),
				);
				if (
					requestID !== fileSearchRequestID ||
					query !== store.query ||
					widget !== store.focusedWidget ||
					!store.isVisible
				)
					return;
				runInAction(() => {
					store.indexedFileResults = results.map((file) => ({
						id: `file:${file.path}`,
						type: ItemType.FILE,
						name: file.name,
						url: file.path,
						isFolder: file.isFolder,
					}));
				});
			} catch (_) {
				if (requestID === fileSearchRequestID) {
					solNative.showToast("Could not search local files", "error");
				}
			} finally {
				if (requestID === fileSearchRequestID) {
					runInAction(() => {
						store.isFileSearching = false;
					});
				}
			}
		},
		get items(): Item[] {
			const allItems = [
				...store.apps,
				...baseItems.filter(item => !["start_google_meet", "create_google_meet"].includes(item.id)),
				...store.customItems,
				...root.scripts.scripts,
				...(store.showInAppBrowserBookMarks ? store.bookmarks : []),
			];

			// If the query is empty, return all items
			if (!store.query) {
				return [...allItems].sort(compareRankedItems);
			}
			const commandItems = quickCommandItems(store.query, studentHub.commands, {
				complete: (text) => store.setQuery(text),
				openDraft: (kind, text) => {
					if (kind === "todo") void store.submitLiveTask();
					else studentHub.openDraft(kind, text);
				},
				handoff: (text) => { void studentHub.capture(text); },
			});
			if (commandItems) return commandItems.map((item) => ({ ...item, type: ItemType.CONFIGURATION }));

			if (minisearch.documentCount === 0) {
				minisearch.addAll(allItems);
			} else {
				for (const item of allItems) {
					if (!minisearch.has(item.id)) {
						minisearch.add(item);
					}
				}
			}

			const results = minisearch.search(store.query, {
				boost: {
					name: 2,
				},
				prefix: true,
				fuzzy: true,
			}) as unknown as RankedItem[];
			for (const result of results) {
				result.matchTier = getMatchTier(result);
			}

			results.sort(compareRankedItems);

			const temporaryResultItems = store.temporaryResult
				? [{ id: "temporary", type: ItemType.TEMPORARY_RESULT, name: "" }]
				: [];

			const captureQuery = store.query;
			const createTaskItems: Item[] = !store.temporaryResult && taskCaptureText(captureQuery) ? [{
				id: "studenthub-create", type: ItemType.CONFIGURATION,
				name: `Add todo: ${captureQuery}`, icon: "☑",
				preventClose: true,
				callback: () => { void store.submitLiveTask(); },
			}] : [];
			const taskIntent = /\b(task|todo|homework|assignment|tmr|tomorrow|today|tonight|due|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|作业|作業|明天|今天|后天|後天|下周|下週/i.test(captureQuery);
			const exactApps = results.filter(item => item.type === ItemType.APPLICATION && [item.name, item.localizedName].some(name => name?.toLowerCase() === captureQuery.toLowerCase()));
			const finalResults: Item[] = [
				...temporaryResultItems,
				...exactApps,
				...(taskIntent ? createTaskItems : []),
				...studentHub.tasks.filter(task => !task.isCompleted && `${task.title} ${task.course}`.toLowerCase().includes(store.query.toLowerCase())).slice(0, 8).map(task => ({
					id: `studenthub-task-${task.id}`, type: ItemType.CONFIGURATION, name: task.title, icon: "☐",
					callback: () => { void Linking.openURL(task.url); },
				})),
				...results.filter(item => !exactApps.some(app => app.id === item.id)),
				...store.indexedFileResults.slice(0, 10),
				...(!taskIntent ? createTaskItems : []),
			];

			return finalResults;
		},
		get searchItems(): Item[] {
			return store.items.filter((item) => !store.isItemDisabled(item.id));
		},
		get currentItem(): Item | undefined {
			return store.searchItems[store.selectedIndex];
		},
		submitLiveTask: async () => {
			const query = store.query;
			if (studentHub.pendingID || store.taskCapture.saving || store.temporaryResult) return;
			store.taskCapture.setQuery(query);
			if (await store.taskCapture.submit(query)) {
				runInAction(() => {
					if (store.query === query) store.setQuery("");
				});
				solNative.showToast("Task added to Student Hub", "success");
			}
		},
		//                _   _
		//      /\       | | (_)
		//     /  \   ___| |_ _  ___  _ __  ___
		//    / /\ \ / __| __| |/ _ \| '_ \/ __|
		//   / ____ \ (__| |_| | (_) | | | \__ \
		//  /_/    \_\___|\__|_|\___/|_| |_|___/
		setHoveredEventId: (id: string | null) => {
			store.hoveredEventId = id;
		},
		setHyperKeyEnabled: (enabled: boolean) => {
			store.hyperKeyEnabled = enabled;
			solNative.setHyperKeyEnabled(enabled);
		},
		rotateScratchPadColor: () => {
			if (store.scratchPadColor === ScratchPadColor.SYSTEM) {
				store.scratchPadColor = ScratchPadColor.BLUE;
			} else if (store.scratchPadColor === ScratchPadColor.BLUE) {
				store.scratchPadColor = ScratchPadColor.ORANGE;
			} else {
				store.scratchPadColor = ScratchPadColor.SYSTEM;
			}
		},
		setShowUpcomingEvent: (v: boolean) => {
			store.showUpcomingEvent = v;
			solNative.setUpcomingEventEnabled(v && store.calendarEnabled);
		},
		recordItemSelection: (item: Item) => {
			const previousCount = getSelectionCount(item);
			store.frequencies[item.id] = previousCount + 1;
			store.selectionTimestamps[item.id] = Date.now();
		},
		showEmojiPicker: () => {
			store.query = "";
			if (store.focusedWidget === Widget.EMOJIS) {
				store.focusedWidget = Widget.SEARCH;
			} else {
				store.focusWidget(Widget.EMOJIS);
			}
		},
		showSettings: () => {
			store.setQuery("");
			store.focusWidget(Widget.SETTINGS);
		},
		setSelectedIndex: (idx: number) => {
			store.selectedIndex = idx;
		},
		setNote: (note: string) => {
			store.note = note;
		},
		createCustomItem: (item: Item) => {
			store.customItems.push(item);
		},
		updateCustomItem: (updatedItem: Item) => {
			const index = store.customItems.findIndex((i) => i.id === updatedItem.id);
			if (index !== -1) {
				store.customItems[index] = updatedItem;
				minisearch.discard(updatedItem.id);
			}
		},
		deleteCustomItem: (itemId: string) => {
			store.customItems = store.customItems.filter((i) => i.id !== itemId);
			if (minisearch.has(itemId)) {
				minisearch.discard(itemId);
			}
		},
		setEditingCustomItem: (item: Item | null) => {
			store.editingCustomItem = item;
		},
		disableItem: (itemId: string) => {
			if (!store.disabledItemIds.includes(itemId)) {
				store.disabledItemIds.push(itemId);
				// Remove shortcut if present
				if (store.shortcuts[itemId]) {
					delete store.shortcuts[itemId];
				}
			}
		},
		enableItem: (itemId: string) => {
			store.disabledItemIds = store.disabledItemIds.filter(
				(id) => id !== itemId,
			);
		},
		isItemDisabled: (itemId: string) => {
			return store.disabledItemIds.includes(itemId);
		},
		translateQuery: async () => {
			void studentHub.capture(store.query);
		},
		openKeyboardSettings: () => {
			void Linking.openURL("/System/Library/PreferencePanes/Keyboard.prefPane");
		},
		setFirstTranslationLanguage: (l: string) => {
			store.firstTranslationLanguage = l;
		},
		setSecondTranslationLanguage: (l: string) => {
			store.secondTranslationLanguage = l;
		},
		setThirdTranslationLanguage: (l: string) => {
			store.thirdTranslationLanguage = l;
		},
		setOnboardingStep: (step: OnboardingStep) => {
			store.onboardingStep = step;
		},
		setGlobalShortcut: (key: string) => {
			const shortcut = launcherShortcut(key);
			const error = shortcutError(shortcut);
			if (error || hasShortcutConflict(store.shortcuts, shortcut)) {
				solNative.showToast(
					error ?? "Shortcut already assigned to another action",
					"error",
				);
				return false;
			}
			solNative.setGlobalShortcut(shortcut);
			store.globalShortcut = shortcut;
			return true;
		},
		setShowWindowOn: (on: "screenWithFrontmost" | "screenWithCursor") => {
			solNative.setShowWindowOn(on);
			store.showWindowOn = on;
		},
		focusWidget: (widget: Widget) => {
			store.selectedIndex = 0;
			store.focusedWidget = widget;
		},
		setFocus: (widget: Widget) => {
			store.focusedWidget = widget;
		},
		setQuery: (query: string) => {
			if (currencyTimer != null) clearTimeout(currencyTimer);
			currencyController?.abort();
			if (dictionaryTimer != null) clearTimeout(dictionaryTimer);
			const requestId = ++dictionaryRequestId;
			store.query = query.replace("\n", " ");
			store.selectedIndex = 0;
			store.temporaryResult = null;

			if (store.query === "") {
				return;
			}

			if (store.focusedWidget === Widget.SEARCH) {
				if (store.query.trim().startsWith("/")) return;
				const dictionaryTerm = parseDictionaryQuery(store.query);
				if (dictionaryTerm != null) {
					store.temporaryResult = {
						kind: "dictionary",
						word: dictionaryTerm || "Define a word",
						definition: dictionaryTerm
							? "Looking up installed dictionaries…"
							: "Type define followed by a word or phrase (up to 256 characters).",
						status: dictionaryTerm ? "loading" : "missing",
					};
					if (dictionaryTerm) {
						dictionaryTimer = setTimeout(() => {
							void solNative
								.lookupDefinition(dictionaryTerm)
								.then((definition) => {
									if (
										dictionaryRequestId !== requestId ||
										store.focusedWidget !== Widget.SEARCH
									)
										return;
									runInAction(() => {
										store.temporaryResult = {
											kind: "dictionary",
											word: dictionaryTerm,
											definition:
												definition ||
												"No definition found in your active installed dictionaries. Enable or download dictionaries in Dictionary → Settings.",
											status: definition ? "found" : "missing",
										};
									});
								})
								.catch(() => {
									if (
										dictionaryRequestId !== requestId ||
										store.focusedWidget !== Widget.SEARCH
									)
										return;
									runInAction(() => {
										store.temporaryResult = {
											kind: "dictionary",
											word: dictionaryTerm,
											definition:
												"Dictionary lookup is unavailable. Check your installed dictionaries in Dictionary → Settings.",
											status: "error",
										};
									});
								});
						}, 150);
					}
					return;
				}

				const timezoneResult = parseTimezoneConversion(store.query);
				if (timezoneResult != null) {
					store.temporaryResult = timezoneResult;
					return;
				}

				const unitResult = parseUnitConversion(store.query);
				if (unitResult != null) {
					store.temporaryResult = unitResult;
					return;
				}

				const currencyRequest = parseCurrencyConversion(store.query);
				if (currencyRequest != null) {
					const querySnapshot = store.query;
					const controller = new AbortController();
					currencyController = controller;
					store.temporaryResult = createTextTemporaryResult(
						"Looking up rate…",
						"Currency conversion",
					);
					currencyTimer = setTimeout(() => {
						const timeout = setTimeout(() => controller.abort(), 6000);
						void fetchCurrencyConversion(currencyRequest, controller.signal)
							.then((result) => {
								if (
									store.focusedWidget === Widget.SEARCH &&
									store.query === querySnapshot &&
									currencyController === controller
								) {
									runInAction(() => {
										store.temporaryResult = result;
									});
								}
							})
							.catch(() => {
								if (
									store.focusedWidget === Widget.SEARCH &&
									store.query === querySnapshot &&
									currencyController === controller
								) {
									runInAction(() => {
										store.temporaryResult = createTextTemporaryResult(
											"Rate unavailable",
											"Check your connection or currency pair",
										);
									});
								}
							})
							.finally(() => clearTimeout(timeout));
					}, 350);
					return;
				}


				try {
					const res = exprParser.evaluate(
						normalizeCalculatorQuery(store.query),
					);
					if (typeof res === "number" && !Number.isNaN(res)) {
						store.temporaryResult = createTextTemporaryResult(
							formatExpressionResult(res, store.query),
							store.query,
						);
					} else {
						store.temporaryResult = null;
					}
				} catch (_) {
					store.temporaryResult = null;
				}

				if (query === "ip") {
					const info = solNative.getWifiInfo();
					if (info.ip) {
						store.temporaryResult = createTextTemporaryResult(info.ip, "IP");
					}
				}
			}
		},
		updateApps: (
			apps: Array<{
				name: string;
				localizedName: string;
				url: string;
				isRunning: boolean;
			}>,
		) => {
			// First update the app list
			const appsRecord: Record<string, Item> = {};

			for (const { name, localizedName, url, isRunning } of apps) {
				if (name === "sol") {
					continue;
				}

				const alias = getInitials(name);
				// const plistPath = decodeURIComponent(
				//   url.replace('file://', '') + 'Contents/Info.plist',
				// )

				// if (solNative.exists(plistPath)) {
				//   try {
				//     let plistContent = solNative.readFile(plistPath)
				//     if (plistContent != null) {
				//       const properties = plist.parse(plistContent)
				//       alias = properties.CFBundleIdentifier ?? '' + getInitials(name)
				//     } else {
				//       alias = getInitials(name)
				//     }
				//   } catch (e) {
				//     // intentionally left blank
				//   }
				// }

				appsRecord[url] = {
					id: url,
					type: ItemType.APPLICATION as ItemType.APPLICATION,
					url: decodeURI(url.replace("file://", "")),
					name: name,
					localizedName: localizedName,
					isRunning,
					alias,
				};
			}

			// minisearch is stupid and there is no way to remove a single item via scanning
			// so we remove all items and add them again
			minisearch.removeAll();

			runInAction(() => {
				store.apps = Object.values(appsRecord);
			});

			// As a courtesy, we also remove keyboard shortcuts for applications that are no longer found
			// const shorcutsKeys = Object.keys(root.ui.shortcuts)
			// const ids = store.items.map(i => i.id)
			// for (const shortcutKey of shorcutsKeys) {
			//   if (!ids.includes(shortcutKey)) {
			//     delete root.ui.shortcuts[shortcutKey]
			//   }
			// }
		},
		quitSelectedApplication: async () => {
			const item = store.currentItem;
			if (
				store.focusedWidget !== Widget.SEARCH ||
				store.confirmDialogShown ||
				store.showKeyboardRecorder ||
				store.isQuittingApplication ||
				item?.type !== ItemType.APPLICATION ||
				!item.isRunning ||
				!item.url
			)
				return;

			store.isQuittingApplication = true;
			try {
				const result = await solNative.quitApplication(item.url);
				const name = item.localizedName || item.name;
				if (result === "requested") {
					solNative.showToast(`Quit requested for ${name}`, "success");
				} else if (result === "notRunning") {
					solNative.showToast(`${name} is no longer running`, "error");
				} else if (result === "protectedApplication") {
					solNative.showToast("Use Sol’s menu to quit Sol", "error");
				} else {
					solNative.showToast(
						`Could not send a quit request to ${name}`,
						"error",
					);
				}
				store.getApps();
			} catch (_) {
				solNative.showToast("Could not send a quit request", "error");
			} finally {
				runInAction(() => {
					store.isQuittingApplication = false;
				});
			}
		},
		getApps: () => {
			solNative.getApplications().then((apps) => {
				store.updateApps(apps);
			});
		},
		onShow: ({ target, query }: { target?: string; query?: string }) => {
			store.getApps();
			store.isVisible = true;
			if (query != null && query.trim() && query.length <= 10000) {
				store.focusWidget(Widget.SEARCH);
				store.setQuery(query);
				const command = parseQuickCommand(query);
				if ((command?.kind === "todo" && command.text) || (!query.trim().startsWith("/") && taskCaptureText(query))) return;
				if (command) studentHub.openDraft(command.kind, command.text);
				else void studentHub.capture(query);
				return;
			}
			if (target != null) {
				switch (target) {
					case Widget.CLIPBOARD:
						store.showClipboardManager();
						return;

					case Widget.SCRATCHPAD:
						store.showScratchpad();
						return;

					case Widget.EMOJIS:
						store.showEmojiPicker();
						return;

					case Widget.SETTINGS:
						store.showSettings();
						return;
				}
				return;
			}

			if (store.focusedWidget === Widget.SEARCH && !studentHub.editing) store.setQuery("");
			// Opening the launcher only reads Hub's continuously updated snapshot.
			// A URL refresh here makes SwiftUI create a new Hub window on each open.
			studentHub.refresh();

			setImmediate(() => {
				if (!store.isAccessibilityTrusted) {
					store.getAccessibilityStatus();
				}

				if (!store.hasFullDiskAccess) {
					store.getFullDiskAccessStatus();
				}
			});
		},
		onHide: () => {
			store.isVisible = false;
			store.focusedWidget = Widget.SEARCH;
			store.editingCustomItem = null;
			if (store.temporaryResult == null) {
				store.setQuery("");
			}
			store.selectedIndex = 0;
			store.translationResults = [];
			store.historyPointer = 0;
		},
		cleanUp: () => {
			taskCaptureDisposer?.();
			store.taskCapture.stop();
			if (currencyTimer != null) clearTimeout(currencyTimer);
			currencyController?.abort();
			if (dictionaryTimer != null) clearTimeout(dictionaryTimer);
			dictionaryRequestId++;
			fileSearchDisposer?.();
			store.invalidateFileSearch();
			onShowListener?.remove();
			onHideListener?.remove();
			onFileSearchListener?.remove();
			onHotkeyListener?.remove();
			onAppsChangedListener?.remove();
			appareanceListener?.remove();
			bookmarksDisposer?.();
			configDisposer?.();
		},
		getCalendarAccess: () => {
			store.calendarAuthorizationStatus =
				solNative.getCalendarAuthorizationStatus();
		},
		getAccessibilityStatus: () => {
			solNative.getAccessibilityStatus().then((v) => {
				runInAction(() => {
					store.isAccessibilityTrusted = v;
				});
			});
		},
		showScratchpad: () => {
			if (store.focusedWidget === Widget.SCRATCHPAD) {
				store.focusWidget(Widget.SEARCH);
			} else {
				store.focusWidget(Widget.SCRATCHPAD);
			}
		},
		showClipboardManager: () => {
			store.query = "";
			if (store.focusedWidget === Widget.CLIPBOARD) {
				store.focusWidget(Widget.SEARCH);
			} else {
				store.focusWidget(Widget.CLIPBOARD);
			}
		},
		showProcessManager: () => {
			store.query = "";
			store.focusWidget(Widget.PROCESSES);
		},
		setCalendarEnabled: (v: boolean) => {
			store.calendarEnabled = v;
			solNative.setUpcomingEventEnabled(v && store.showUpcomingEvent);
		},
		setShowAllDayEvents: (v: boolean) => {
			store.showAllDayEvents = v;
		},
		setLaunchAtLogin: (v: boolean) => {
			store.launchAtLogin = v;
			solNative.setLaunchAtLogin(v);
		},
		getFullDiskAccessStatus: async () => {
			const hasAccess = await solNative.hasFullDiskAccess();
			runInAction(() => {
				store.hasFullDiskAccess = hasAccess;
			});
			store.getBookmarks();
		},
		getBookmarks: async () => {
			// Fetch all bookmarks and deduplicate by id
			const allBookmarks: Item[] = [];

			const safariBookmarks = await store.getSafariBookmarks();

			const sources = [
				{
					id: "brave",
					favicon: Assets.Brave,
					path: `/Users/${store.username}/Library/Application Support/BraveSoftware/Brave-Browser/Default/Bookmarks`,
				},
				{
					id: "chrome",
					favicon: Assets.Chrome,
					path: `/Users/${store.username}/Library/Application Support/Google/Chrome/Default/Bookmarks`,
				},
				{
					id: "vivaldi",
					favicon: Assets.Vivaldi,
					path: `/Users/${store.username}/Library/Application Support/Vivaldi/Default/Bookmarks`,
				},
				{
					id: "edge",
					favicon: Assets.Edge,
					path: `/Users/${store.username}/Library/Application Support/Microsoft Edge/Default/Bookmarks`,
				},
			];

			const chromiumResults = await Promise.all(
				sources.map((s) => store.getChromiumBookmarks(s)),
			);

			// Use a Set to keep track of unique ids
			const seenIds = new Set<string>();

			for (const bookmark of [...safariBookmarks, ...chromiumResults.flat()]) {
				if (!seenIds.has(bookmark.id)) {
					allBookmarks.push(bookmark);
					seenIds.add(bookmark.id);
				}
			}

			runInAction(() => {
				store.bookmarks = allBookmarks;
			});
		},
		getSafariBookmarks: async (): Promise<Item[]> => {
			if (!store.hasFullDiskAccess) {
				return [];
			}
			const safariBookmarksRaw = await solNative.getSafariBookmarks();

			return safariBookmarksRaw.map((bookmark: any, idx: number): Item => {
				return {
					id: `${bookmark.title}_safari_${idx}`,
					name: bookmark.title,
					type: ItemType.BOOKMARK,
					bookmarkFolder: null,
					faviconFallback: Assets.Safari,
					url: bookmark.url,
					callback: () => {
						Linking.openURL(bookmark.url);
					},
				};
			});
		},
		getChromiumBookmarks: async (source: {
			id: string;
			favicon: any;
			path: string;
		}): Promise<Item[]> => {
			try {
				const path = source.path;
				const exists = solNative.exists(path);
				if (!exists) {
					return [];
				}

				const bookmarksString = solNative.readFile(path);
				if (!bookmarksString) {
					return [];
				}

				const OGbookmarks = JSON.parse(bookmarksString);

				const bookmarks: {
					title: string;
					url: string;
					bookmarkFolder: null | string;
				}[] = [];

				for (const root of Object.values<
					{ children?: BookmarkNode[] } | undefined
				>(OGbookmarks.roots ?? {})) {
					if (root?.children) {
						traverse(bookmarks, root.children, null);
					}
				}

				return bookmarks.map(
					(bookmark, idx): Item => ({
						id: `${bookmark.title}_${source.id}_${idx}`,
						name: bookmark.title,
						bookmarkFolder: bookmark.bookmarkFolder,
						type: ItemType.BOOKMARK,
						faviconFallback: source.favicon,
						url: bookmark.url,
						callback: () => {
							Linking.openURL(bookmark.url);
						},
					}),
				);
			} catch (e) {
				console.error(`Could not read ${source.id} bookmarks: ${e}`);
				return [];
			}
		},

		setMediaKeyForwardingEnabled: (enabled: boolean) => {
			store.mediaKeyForwardingEnabled = enabled;
			solNative.setMediaKeyForwardingEnabled(enabled);
		},

		setTargetHeight: (height: number) => {
			store.targetHeight = height;
		},

		onColorSchemeChange({
			colorScheme,
		}: {
			colorScheme: "light" | "dark" | null | undefined;
		}) {
			if (colorScheme === "dark") {
				store.isDarkMode = true;
				// nativeWindColorScheme.set("dark")
			} else {
				store.isDarkMode = false;
				// nativeWindColorScheme.set("light")
			}
			RNRestart.restart();
		},

		addToHistory: (query: string) => {
			store.history.push(query);
		},

		setHistoryPointer: (pointer: number) => {
			if (pointer > store.history.length - 1) {
				return;
			}
			store.historyPointer = pointer;
		},

		showFileSearch: () => {
			store.focusWidget(Widget.FILE_SEARCH);
			store.query = "";
		},

		addSearchFolder: (folder: string) => {
			store.searchFolders.push(folder);
			store.isIndexing = true;
			void solNative.indexPaths([folder]).then(() => {
				runInAction(() => {
					store.isIndexing = false;
				});
			});
		},

		removeSearchFolder: (folder: string) => {
			store.searchFolders = store.searchFolders.filter((f) => f !== folder);
			void solNative.removeIndexedPath(folder);
		},

		reindexAll: () => {
			solNative.clearIndex();
			if (store.searchFolders.length === 0) return;
			runInAction(() => {
				store.isIndexing = true;
			});
			void solNative.indexPaths(toJS(store.searchFolders)).then(() => {
				runInAction(() => {
					store.isIndexing = false;
				});
			});
		},

		setSearchEngine: (engine: SearchEngine) => {
			store.searchEngine = engine;
		},

		setEmojiSkinTone: (value: EmojiSkinTone) => {
			store.emojiSkinTone = value;
		},

		setCustomSearchUrl: (url: string) => {
			store.customSearchUrl = url;
		},

		onHotKey: async ({ id }: { id: string }) => {
			const item = [
				...store.apps,
				...baseItems.filter(item => !["start_google_meet", "create_google_meet"].includes(item.id)),
				...store.customItems,
				...root.scripts.scripts,
				...(store.showInAppBrowserBookMarks ? store.bookmarks : []),
			].find((i) => i.id === id);

			if (item == null) {
				return;
			}

			// TODO logic repeated from keystroke.store.ts. At some point de-duplicate
			if (item.type === ItemType.CUSTOM) {
				if (!item.text) {
					return;
				}

				if (item.isApplescript) {
					solNative.executeAppleScript(item.text);
				} else {
					try {
						const canOpenURL = await Linking.canOpenURL(item.text);
						if (canOpenURL) {
							await Linking.openURL(item.text);
						} else {
							solNative.showToast(`Could not open URL: ${item.text}`, "error");
						}
					} catch (_e) {
						solNative.showToast(`Could not open URL: ${item.text}`, "error");
					}
				}
			}

			if (item.callback) {
				item.callback();
			} else if (item.url) {
				solNative.openFile(item.url);
			}

			if (itemsThatShouldShowWindow.includes(item.id)) {
				setTimeout(solNative.showWindow, 0);
			}
		},

		setShortcut(id: string, shortcut: string) {
			const normalizedShortcut = canonicalShortcut(shortcut);
			if (normalizedShortcut && shortcutError(normalizedShortcut)) {
				solNative.showToast(shortcutError(normalizedShortcut)!, "error");
				return false;
			}
			if (
				normalizedShortcut &&
				normalizedShortcut === launcherShortcut(store.globalShortcut)
			) {
				solNative.showToast("Shortcut is assigned to opening Sol", "error");
				return false;
			}

			// Check for duplicate shortcut
			if (normalizedShortcut !== "") {
				const isDuplicate = Object.entries(store.shortcuts).some(
					([key, value]) =>
						canonicalShortcut(value) === normalizedShortcut && key !== id,
				);
				if (isDuplicate) {
					solNative.showToast("Shortcut already exists", "error", 4);
					return false;
				}
			}

			store.shortcuts[id] = normalizedShortcut;
			solNative.updateHotkeys(toJS(store.shortcuts));
			return true;
		},

		restoreDefaultShorcuts() {
			if (hasShortcutConflict(defaultShortcuts, store.globalShortcut)) {
				solNative.showToast(
					"Change the launcher shortcut before restoring action defaults",
					"error",
				);
				return;
			}
			store.shortcuts = { ...defaultShortcuts };
			solNative.updateHotkeys(defaultShortcuts);
		},

		setWindowHeight(e: LayoutChangeEvent) {
			solNative.setWindowHeight(e.nativeEvent.layout.height);
		},

		setShowInAppBrowserBookmarks: (v: boolean) => {
			store.showInAppBrowserBookMarks = v;
		},

		// Old custom items are not migrated to the new format which has an id
		// This function is used to migrate the old custom items to the new format
		// by just adding a random id
		migrateCustomItems() {
			store.customItems = store.customItems.map((i) => {
				if (i.id) {
					return i;
				}

				return { ...i, id: Math.random().toString() };
			});
		},
		setHasDismissedGettingStarted: (v: boolean) => {
			store.hasDismissedGettingStarted = v;
		},
		applicationsChanged: () => {
			store.getApps();
		},
		closeKeyboardRecorder: () => {
			store.showKeyboardRecorder = false;
			store.keyboardRecorderSelectedItem = null;
			store.shortcutSearchMode = false;
			root.keystroke.commandPressed = false;
			root.keystroke.shiftPressed = false;
			root.keystroke.controlPressed = false;
		},
		setShowKeyboardRecorderForItem: (show: boolean, itemId: string) => {
			store.showKeyboardRecorder = show;
			store.keyboardRecorderSelectedItem = itemId;
			store.shortcutSearchMode = false;
		},
		startShortcutSearch: () => {
			store.showKeyboardRecorder = true;
			store.shortcutSearchMode = true;
			store.keyboardRecorderSelectedItem = null;
		},
		setShortcutSearchFilter: (shortcut: string | null) => {
			store.shortcutSearchFilter = shortcut;
		},
		clearShortcutSearch: () => {
			store.shortcutSearchFilter = null;
			store.shortcutSearchMode = false;
		},
		setShortcutFromUI: (shortcut: string[]) => {
			const normalizedShortcut = normalizeShortcut(shortcut.join("+"));

			if (store.keyboardRecorderSelectedItem === "__launcher__") {
				if (store.setGlobalShortcut(normalizedShortcut))
					store.closeKeyboardRecorder();
				return;
			}

			// Check if we're in shortcut search mode
			if (store.shortcutSearchMode) {
				store.shortcutSearchFilter = normalizedShortcut;
				setTimeout(() => {
					runInAction(() => {
						store.closeKeyboardRecorder();
					});
				}, 500);
				return;
			}

			const itemId = store.keyboardRecorderSelectedItem;
			if (itemId && store.setShortcut(itemId, normalizedShortcut)) {
				store.closeKeyboardRecorder();
			}
		},
		confirm: async (title: string, callback: () => unknown) => {
			store.confirmDialogShown = true;
			store.confirmCallback = callback;
			store.confirmTitle = title;
		},
		closeConfirm: () => {
			store.confirmDialogShown = false;
			store.confirmCallback = null;
			store.confirmTitle = null;
		},
		executeConfirmCallback: async () => {
			const callback = store.confirmCallback;
			store.closeConfirm();
			await callback?.();
		},
		reloadJsonConfig,
	});

	fileSearchDisposer = reaction(
		() => [
			store.query,
			store.focusedWidget,
			store.isVisible,
			store.searchFolders.join("\0"),
		],
		() => {
			store.invalidateFileSearch();
			const query = store.query;
			fileSearchTimer = setTimeout(() => {
				void store.runFileSearch(query);
			}, 150);
		},
	);

	taskCaptureDisposer = reaction(
		() => store.focusedWidget === Widget.SEARCH &&
			!store.temporaryResult && !studentHub.editing ? store.query : "",
		(query) => store.taskCapture.setQuery(query),
	);

	bookmarksDisposer = reaction(
		() => [store.showInAppBrowserBookMarks],
		() => {
			minisearch.removeAll();
		},
	);

	hydrate().then(() => {
		configDisposer = autorun(() => {
			getPersistedUISnapshot();
			persistToJson();
		});
		store.getCalendarAccess();
		store.getAccessibilityStatus();
		store.getFullDiskAccessStatus();
		solNative.setUpcomingEventEnabled(
			store.showUpcomingEvent && store.calendarEnabled,
		);

		if (store.searchFolders.length > 0) {
			if (!solNative.hasIndexedContent()) {
				runInAction(() => {
					store.isIndexing = true;
				});
				void solNative.indexPaths(toJS(store.searchFolders)).then(() => {
					runInAction(() => {
						store.isIndexing = false;
					});
				});
			} else {
				// DB already populated — just start watching for changes
				solNative.startWatchingPaths(toJS(store.searchFolders));
			}
		}
	});

	appareanceListener = Appearance.addChangeListener(store.onColorSchemeChange);
	onShowListener = solNative.addListener("onShow", store.onShow);
	onHideListener = solNative.addListener("onHide", store.onHide);
	onHotkeyListener = solNative.addListener("hotkey", store.onHotKey);
	onAppsChangedListener = solNative.addListener(
		"applicationsChanged",
		store.applicationsChanged,
	);

	return store;
};
