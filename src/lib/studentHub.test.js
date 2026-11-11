import assert from "node:assert/strict";
import { mock, test } from "bun:test";

let exists = true;
let raw = "";
const requests = [];
mock.module("./SolNative", () => ({
	solNative: {
		userName: () => "fixture-user",
		exists: () => exists,
		readFile: () => raw,
		openStudentHubURL: async (url) => {
			requests.push(url);
		},
	},
}));
mock.module("react-native", () => ({
	Linking: {
		openURL: async (url) => {
			requests.push(url);
		},
	},
}));
const {
	StudentHub,
	decodeHubSnapshot,
	formatHubTaskDue,
	countdownDays,
	hubURL,
} = await import("./studentHub");

function fixture() {
	return {
		schemaVersion: 1,
		generatedAt: "2026-11-10T16:00:00Z",
		bridgeToken: "fixture-token",
		tasks: [
			{
				id: "fixture-task",
				title: "C++ homework",
				details: "A&B=1+2",
				course: "Math",
				dueDate: "2026-11-12T02:00:00Z",
				includesDueTime: true,
				isCompleted: false,
				url: "studenthub://tasks?select=fixture-task",
			},
		],
		countdowns: [
			{
				id: "fixture-day",
				title: "Annual event",
				date: "2026-06-01T00:00:00Z",
				nextOccurrence: "2027-06-01T00:00:00Z",
				daysRemaining: 203,
				isArchived: false,
				repeatsYearly: true,
				url: "studenthub://countdowns?select=fixture-day",
			},
		],
	};
}
function reset() {
	exists = true;
	raw = JSON.stringify(fixture());
	requests.length = 0;
}

test("snapshot validation preserves text and optional deadlines while rejecting malformed shapes", () => {
	const data = fixture();
	assert.equal(decodeHubSnapshot(data).tasks[0].details, "A&B=1+2");
	data.tasks[0].dueDate = null;
	assert.equal(decodeHubSnapshot(data).tasks[0].dueDate, null);
	data.tasks[0].title = null;
	assert.throws(() => decodeHubSnapshot(data));
	const invalid = fixture();
	invalid.countdowns[0].nextOccurrence = "not a date";
	assert.throws(() => decodeHubSnapshot(invalid));
	const remote = fixture();
	remote.tasks[0].url = "https://example.com";
	assert.throws(() => decodeHubSnapshot(remote));
});

test("local refresh reconnects after its file disappears without opening Student Hub", () => {
	reset();
	const hub = new StudentHub();
	hub.refresh();
	assert.equal(hub.tasks.length, 1);
	exists = false;
	hub.refresh();
	assert.equal(hub.snapshot, null);
	exists = true;
	hub.refresh();
	assert.equal(hub.tasks.length, 1);
	assert.equal(requests.length, 0);
});

test("mutation succeeds only after a matching acknowledgment, independent of UUID case", async () => {
	reset();
	const hub = new StudentHub();
	try {
		let settled = false;
		const result = hub
			.mutate("update", fixture().tasks[0], { title: "Updated" })
			.then((value) => {
				settled = true;
				return value;
			});
		await Promise.resolve();
		assert.equal(settled, false);
		assert.ok(hub.pendingID);
		const data = fixture();
		data.lastRequest = { id: hub.pendingID.toUpperCase(), success: true };
		raw = JSON.stringify(data);
		hub.refresh();
		assert.equal(await result, true);
		assert.equal(hub.pendingID, "");
		assert.equal(requests.length, 1);
		assert.match(requests[0], /title=Updated/);
	} finally {
		hub.stop();
	}
});

test("rejected and unconfirmed mutations fail without pretending the draft was saved", async () => {
	reset();
	const hub = new StudentHub(5);
	try {
		const result = hub.mutate("update", fixture().tasks[0], {
			schedule: "not a date",
		});
		await Promise.resolve();
		const data = fixture();
		data.lastRequest = {
			id: hub.pendingID,
			success: false,
			error: "Date not recognized",
		};
		raw = JSON.stringify(data);
		hub.refresh();
		assert.equal(await result, false);
		assert.equal(hub.error, "Date not recognized");
		assert.equal(
			await hub.mutate("update", fixture().tasks[0], { title: "Retry" }),
			false,
		);
		assert.match(hub.error, /not confirmed/);
	} finally {
		hub.stop();
	}
});

test("preview requests are correlated, superseded safely, and never save a task", async () => {
	reset();
	const hub = new StudentHub(100);
	try {
		const first = hub.previewCommand("/todo Old homework tomorrow");
		await Promise.resolve();
		const oldID = hub.previewID;
		const second = hub.previewCommand("/countdown Exam Friday");
		assert.equal(await first, null);
		const latestID = hub.previewID;
		const data = fixture();
		data.lastPreview = {
			id: oldID,
			success: false,
			kind: "todo",
			error: "Old response",
		};
		raw = JSON.stringify(data);
		hub.refresh();
		assert.equal(hub.previewID, latestID);
		data.lastPreview = {
			id: latestID.toUpperCase(),
			success: true,
			kind: "countdown",
			title: "Exam",
			details: "",
			course: "",
			dueDate: "2026-11-13",
			includesDueTime: false,
			repeatsYearly: false,
		};
		raw = JSON.stringify(data);
		hub.refresh();
		assert.equal((await second).title, "Exam");
		assert.equal(hub.previewID, "");
		assert.equal(hub.pendingID, "");
		assert.ok(
			requests.every((url) => url.startsWith("studenthub://sol-parse?")),
		);
		assert.equal(hub.tasks.length, 1);
	} finally {
		hub.stop();
	}
});

test("draft cancellation does not mutate tasks and preview responses validate dates", async () => {
	reset();
	const hub = new StudentHub();
	hub.openDraft("todo", "Math tomorrow");
	assert.equal(hub.editing, true);
	const preview = hub.previewCommand("/todo Math tomorrow");
	hub.closeDraft();
	assert.equal(await preview, null);
	assert.equal(hub.editing, false);
	assert.equal(hub.commandDraft, null);
	assert.equal(requests.length, 1);
	const data = fixture();
	data.lastPreview = {
		id: "test",
		success: true,
		kind: "todo",
		title: "Test",
		details: "",
		course: "",
		dueDate: "bad-date",
		includesDueTime: false,
		repeatsYearly: false,
	};
	assert.throws(() => decodeHubSnapshot(data));
	hub.stop();
});

test("day formatting uses calendar dates, date-only values, and yearly rollovers", () => {
	const today = new Date(2026, 10, 11, 12);
	assert.equal(
		formatHubTaskDue({ dueDate: "2026-11-12", includesDueTime: false }, today),
		"Tomorrow",
	);
	assert.equal(
		formatHubTaskDue({ dueDate: "2026-11-10", includesDueTime: false }, today),
		"Yesterday",
	);
	assert.equal(
		formatHubTaskDue({ dueDate: null, includesDueTime: false }, today),
		"No deadline",
	);
	assert.equal(
		countdownDays(
			{
				...fixture().countdowns[0],
				nextOccurrence: "2026-11-10",
				repeatsYearly: false,
			},
			today,
		),
		-1,
	);
	assert.equal(
		countdownDays(
			{ ...fixture().countdowns[0], nextOccurrence: "2026-11-10" },
			today,
		),
		364,
	);
	const hub = new StudentHub();
	hub.now = today.getTime();
	const event = fixture().countdowns[0];
	hub.snapshot = {
		...fixture(),
		countdowns: [
			{
				...event,
				id: "upcoming",
				repeatsYearly: false,
				nextOccurrence: "2026-11-12",
			},
			{
				...event,
				id: "today",
				repeatsYearly: false,
				nextOccurrence: "2026-11-11",
			},
			{
				...event,
				id: "past-event",
				repeatsYearly: false,
				nextOccurrence: "2026-11-10",
			},
			{ ...event, id: "annual-birthday", nextOccurrence: "2026-11-10" },
			{ ...event, id: "archived-future", isArchived: true },
		],
	};
	assert.deepEqual(
		hub.countdowns.map((item) => item.id),
		["upcoming", "today", "annual-birthday"],
	);
	assert.equal(hub.snapshot.countdowns.length, 5);
	assert.match(
		hubURL("quick-command", { text: "C++ A&B=1+2" }),
		/C%2B%2B%20A%26B%3D1%2B2/,
	);
});
