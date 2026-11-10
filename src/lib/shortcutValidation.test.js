import { expect, test } from "bun:test";
import { canonicalShortcut, launcherShortcut, shortcutError } from "./shortcutValidation";

test("modifier order and aliases cannot hide collisions", () => {
	expect(canonicalShortcut("option + cmd + K")).toBe("command+option+k");
	expect(canonicalShortcut("⌘+option+k+command")).toBe("command+option+k");
});
test("legacy launcher preferences remain supported", () => {
	expect(launcherShortcut("command")).toBe("command+space");
	expect(launcherShortcut("control+option+j")).toBe("control+option+j");
});
test("unsafe or unsupported global combinations are rejected", () => {
	for (const value of ["a", "shift+a", "command", "option+a+b", "command+q", "option+é"]) expect(shortcutError(value)).not.toBeNull();
	for (const value of ["command+space", "control+option+7", "option+up"]) expect(shortcutError(value)).toBeNull();
});
