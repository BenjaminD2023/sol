import assert from "node:assert/strict";
import { test } from "bun:test";
import {
	findHubCommand,
	matchingHubCommands,
	parseQuickCommand,
	suggestedQuickCommands,
} from "./quickCommands";

test("slash routing preserves natural-language and literal scratchpad text", () => {
	assert.deepEqual(parseQuickCommand(" /ToDo Math C++ homework tmr 10AM "), {
		kind: "todo",
		text: "Math C++ homework tmr 10AM",
	});
	assert.deepEqual(parseQuickCommand("/capture A&B=1+2\nTomorrow is literal"), {
		kind: "capture",
		text: "A&B=1+2\nTomorrow is literal",
	});
	assert.deepEqual(parseQuickCommand("/countdown"), {
		kind: "countdown",
		text: "",
	});
	assert.equal(parseQuickCommand("/todos homework"), null);
	assert.equal(parseQuickCommand("Math homework tomorrow"), null);
	assert.deepEqual(suggestedQuickCommands("/c"), ["capture", "countdown"]);
});

test("shared catalog supports specialized commands, aliases, and prefix discovery", () => {
	const commands = [
		{
			id: "/schedule",
			command: "/schedule",
			usage: "/schedule <task> at <time>",
			detail: "Plan an existing task",
			takesArgument: true,
			insertionText: "/schedule ",
		},
		{
			id: "/tasks",
			command: "/tasks",
			usage: "/tasks",
			detail: "Open all tasks",
			takesArgument: false,
			insertionText: "/tasks",
		},
		{
			id: "/pomo",
			command: "/pomo",
			usage: "/pomo",
			detail: "Start a focus session",
			takesArgument: false,
			insertionText: "/pomo",
			aliases: ["/pomodoro"],
		},
	];
	assert.equal(
		findHubCommand("/SCHEDULE Essay at tomorrow 10am", commands)?.command,
		"/schedule",
	);
	assert.equal(findHubCommand("/pomodoro", commands)?.command, "/pomo");
	assert.equal(findHubCommand("/task", commands), undefined);
	assert.equal(matchingHubCommands("/", commands).length, commands.length);
	assert.deepEqual(
		matchingHubCommands("/po", commands).map((item) => item.command),
		["/pomo"],
	);
	assert.deepEqual(
		matchingHubCommands("/existing", commands).map((item) => item.command),
		["/schedule"],
	);
});
