import { expect, test } from "bun:test";
import {
	canonicalShortcut,
	launcherShortcut,
	shortcutError,
	persistedLauncherShortcut,
	hasShortcutConflict,
	sanitizeShortcutMap,
} from "./shortcutValidation";

test("modifier order and aliases cannot hide collisions", () => {
	expect(canonicalShortcut("option + cmd + K")).toBe("command+option+k");
	expect(canonicalShortcut("⌘+option+k+command")).toBe("command+option+k");
});
test("legacy launcher preferences remain supported", () => {
	expect(launcherShortcut("command")).toBe("command+space");
	expect(launcherShortcut("control+option+j")).toBe("control+option+j");
});
test("unsafe or unsupported global combinations are rejected", () => {
	for (const value of [
		"a",
		"shift+a",
		"command",
		"option+a+b",
		"command+q",
		"option+é",
	])
		expect(shortcutError(value)).not.toBeNull();
	for (const value of ["command+space", "control+option+7", "option+up"])
		expect(shortcutError(value)).toBeNull();
});

test("persisted launcher preferences validate and recover to Option-Space", () => {
	expect(persistedLauncherShortcut("CMD")).toBe("command+space");
	expect(persistedLauncherShortcut("OPTION+Control+J")).toBe(
		"control+option+j",
	);
	for (const value of [
		null,
		undefined,
		42,
		{},
		"command+q",
		"a",
		"option+a+b",
	]) {
		expect(persistedLauncherShortcut(value)).toBe("option+space");
	}
});

test("restoring defaults detects launcher collisions across modifier order", () => {
	expect(
		hasShortcutConflict({ resize: "control+option+u" }, "option+control+u"),
	).toBe(true);
	expect(
		hasShortcutConflict({ resize: "control+option+u" }, "option+space"),
	).toBe(false);
});

test("persisted action maps cannot register duplicates, invalid keys, or the launcher", () => {
	expect(
		sanitizeShortcutMap(
			{
				first: "option+control+u",
				duplicate: "control+option+u",
				launcher: "option+space",
				invalid: "a",
				notAString: 3,
				arrow: "⌃+⌥+→",
				cleared: "",
			},
			"option",
		),
	).toEqual({
		first: "control+option+u",
		duplicate: "",
		launcher: "",
		invalid: "",
		notAString: "",
		arrow: "control+option+right",
		cleared: "",
	});
});
