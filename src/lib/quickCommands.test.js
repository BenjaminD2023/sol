import assert from "node:assert/strict";
import { test } from "bun:test";
import {
	findHubCommand,
	matchingHubCommands,
	parseQuickCommand,
	quickCommandItems,
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

test("selecting command suggestions completes Sol's input before opening a draft or Hub", () => {
	const commands = [
		{
			id: "/countdown",
			command: "/countdown",
			usage: "/countdown <title> <date>",
			detail: "Create a countdown",
			takesArgument: true,
			insertionText: "/countdown ",
		},
		{
			id: "/schedule",
			command: "/schedule",
			usage: "/schedule <task> at <time>",
			detail: "Plan an existing task",
			takesArgument: true,
			insertionText: "/schedule ",
		},
		{
			id: "/pomo",
			command: "/pomo",
			usage: "/pomo",
			detail: "Start focus",
			takesArgument: false,
			insertionText: "/pomo",
			aliases: ["/pomodoro"],
		},
	];
	let query = "/count";
	const drafts = [];
	const handoffs = [];
	const actions = {
		complete: (text) => {
			query = text;
		},
		openDraft: (kind, text) => drafts.push({ kind, text }),
		handoff: (text) => handoffs.push(text),
	};
	// Execute the same selected-result callbacks returned to UIStore and Enter.
	const enter = (catalog = commands) => {
		const selected = quickCommandItems(query, catalog, actions)?.[0];
		assert.ok(selected);
		assert.equal(selected.preventClose, true);
		selected.callback();
	};
	enter();
	assert.equal(query, "/countdown ");
	enter();
	assert.equal(query, "/countdown ");
	assert.deepEqual(drafts, []);
	assert.deepEqual(handoffs, []);
	query += "Birthday tomorrow";
	enter();
	assert.deepEqual(drafts, [{ kind: "countdown", text: "Birthday tomorrow" }]);
	assert.deepEqual(handoffs, []);

	query = "/sched";
	enter();
	assert.equal(query, "/schedule ");
	enter();
	assert.deepEqual(handoffs, []);
	query += "Essay tomorrow 10AM";
	enter();
	assert.deepEqual(handoffs, ["/schedule Essay tomorrow 10AM"]);

	query = "/pomod";
	enter();
	assert.equal(query, "/pomo");
	assert.equal(handoffs.length, 1);
	enter();
	assert.equal(handoffs.at(-1), "/pomo");
	query = "/pomodoro";
	enter();
	assert.equal(handoffs.at(-1), "/pomodoro");

	for (const kind of ["todo", "capture", "countdown"]) {
		query = `/${kind.slice(0, -1)}`;
		const previousDrafts = drafts.length;
		const previousHandoffs = handoffs.length;
		enter([]);
		assert.equal(query, `/${kind} `);
		enter([]);
		assert.equal(query, `/${kind} `);
		assert.equal(drafts.length, previousDrafts);
		assert.equal(handoffs.length, previousHandoffs);
	}
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
