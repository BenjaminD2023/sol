import assert from "node:assert/strict";
import { test } from "bun:test";
import { LiveTaskCapture, taskCaptureText } from "./liveTaskCapture";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function preview(overrides = {}) {
	return {
		id: "preview-id",
		success: true,
		kind: "todo",
		title: "Math homework",
		details: "Read pages 10–15",
		course: "Math",
		courseID: "course-math",
		dueDate: "2026-11-13T02:00:00Z",
		includesDueTime: true,
		repeatsYearly: false,
		...overrides,
	};
}

async function tick() {
	await Promise.resolve();
	await Promise.resolve();
}

test("live task opt-in keeps partial commands, URLs and dictionary queries in normal search", () => {
	for (const query of [
		"",
		"Chrome",
		"/",
		"/to",
		"/todo",
		"/todo ",
		"/task Essay",
		"/capture thought",
		"/countdown Exam Friday",
		"/tasks",
		"define word",
		"DEFINE two words",
		"https://example.com/a path",
		"www.example.com",
	]) {
		assert.equal(taskCaptureText(query), null, query);
	}
	assert.equal(
		taskCaptureText(" /ToDo Math C++ homework tmr 10AM "),
		"/todo Math C++ homework tmr 10AM",
	);
	assert.equal(
		taskCaptureText("Math Homework from Class tmr 10AM"),
		"/todo Math Homework from Class tmr 10AM",
	);
	assert.equal(taskCaptureText("数学作业明天"), "/todo 数学作业明天");
	assert.equal(taskCaptureText("a".repeat(10_001) + " task"), null);
});

test("typing debounces authoritative preview and never mutates a task", async () => {
	const parsed = deferred();
	const previews = [];
	const mutations = [];
	const controller = new LiveTaskCapture(
		{
			error: "",
			previewCommand: (text) => {
				previews.push(text);
				return parsed.promise;
			},
			mutate: async (...args) => {
				mutations.push(args);
				return true;
			},
		},
		5,
	);
	try {
		controller.setQuery("Math home");
		controller.setQuery("Math homework tomorrow");
		assert.equal(controller.loading, true);
		assert.deepEqual(previews, []);
		await new Promise((resolve) => setTimeout(resolve, 15));
		assert.deepEqual(previews, ["/todo Math homework tomorrow"]);
		assert.deepEqual(mutations, []);
		parsed.resolve(preview());
		await tick();
		assert.equal(controller.loading, false);
		assert.equal(controller.preview.title, "Math homework");
		assert.deepEqual(mutations, []);
	} finally {
		controller.stop();
	}
});

test("Enter flushes pending parsing and repeated Enter saves exactly once", async () => {
	const parsed = deferred();
	const saved = deferred();
	const previews = [];
	const mutations = [];
	const controller = new LiveTaskCapture(
		{
			error: "",
			previewCommand: (text) => {
				previews.push(text);
				return parsed.promise;
			},
			mutate: (...args) => {
				mutations.push(args);
				return saved.promise;
			},
		},
		10_000,
	);
	try {
		const query = "/todo Math homework tomorrow 10AM";
		controller.setQuery(query);
		const first = controller.submit(query);
		assert.equal(controller.saving, true);
		assert.deepEqual(previews, [query]);
		assert.equal(await controller.submit(query), false);
		assert.equal(mutations.length, 0);
		parsed.resolve(preview());
		await tick();
		assert.equal(mutations.length, 1);
		assert.equal(await controller.submit(query), false);
		saved.resolve(true);
		assert.equal(await first, true);
		assert.equal(controller.saving, false);
		assert.equal(await controller.submit(query), false);
		assert.equal(mutations.length, 1);
	} finally {
		controller.stop();
	}
});

test("query changes cancel a waiting submission and late preview responses cannot overwrite the latest task", async () => {
	const oldPreview = deferred();
	const newPreview = deferred();
	const previews = [];
	const mutations = [];
	const controller = new LiveTaskCapture(
		{
			error: "",
			previewCommand: (text) => {
				previews.push(text);
				return previews.length === 1 ? oldPreview.promise : newPreview.promise;
			},
			mutate: async (...args) => {
				mutations.push(args);
				return true;
			},
		},
		10_000,
	);
	try {
		controller.setQuery("Old homework tomorrow");
		const oldSubmit = controller.submit(controller.query);
		controller.setQuery("New homework Friday");
		assert.equal(await oldSubmit, false);
		assert.equal(controller.saving, false);
		assert.equal(mutations.length, 0);
		const newSubmit = controller.submit(controller.query);
		newPreview.resolve(
			preview({ title: "New homework", dueDate: "2026-11-20T02:00:00Z" }),
		);
		assert.equal(await newSubmit, true);
		oldPreview.resolve(preview({ title: "Old homework" }));
		await tick();
		assert.equal(controller.preview.title, "New homework");
		assert.equal(controller.query, "New homework Friday");
		assert.equal(mutations.length, 1);
		assert.equal(mutations[0][2].title, "New homework");
		assert.equal(mutations[0][2].text, "/todo New homework Friday");
		assert.equal(mutations[0][2].dueDate, "2026-11-20T02:00:00Z");
	} finally {
		controller.stop();
	}
});

test("reset ignores an in-flight parse without saving or reviving the draft", async () => {
	const parsed = deferred();
	let mutations = 0;
	const controller = new LiveTaskCapture(
		{
			error: "",
			previewCommand: () => parsed.promise,
			mutate: async () => {
				mutations += 1;
				return true;
			},
		},
		10_000,
	);
	controller.setQuery("Math homework tomorrow");
	const submitted = controller.submit(controller.query);
	controller.reset();
	assert.equal(await submitted, false);
	parsed.resolve(preview());
	await tick();
	assert.equal(controller.query, "");
	assert.equal(controller.preview, null);
	assert.equal(controller.loading, false);
	assert.equal(controller.saving, false);
	assert.equal(mutations, 0);
	controller.stop();
});

test("invalid or failed previews preserve the typed command without creating anything", async () => {
	for (const result of [
		null,
		preview({ success: false, error: "Add a task title." }),
		preview({ dueDate: "invalid" }),
		preview({ kind: "countdown" }),
	]) {
		let mutations = 0;
		const controller = new LiveTaskCapture(
			{
				error: "",
				previewCommand: async () => result,
				mutate: async () => {
					mutations += 1;
					return true;
				},
			},
			10_000,
		);
		try {
			controller.setQuery("Math homework tomorrow");
			assert.equal(await controller.submit(controller.query), false);
			assert.equal(controller.query, "Math homework tomorrow");
			assert.equal(controller.preview, null);
			assert.ok(controller.error);
			assert.equal(controller.loading, false);
			assert.equal(controller.saving, false);
			assert.equal(mutations, 0);
		} finally {
			controller.stop();
		}
	}
});

test("save freezes the preview date, time and course; a failed acknowledgment preserves the draft for retry", async () => {
	const mutations = [];
	let acknowledged = false;
	let previews = 0;
	const controller = new LiveTaskCapture(
		{
			error: "Open Student Hub and refresh before trying again.",
			previewCommand: async () => {
				previews += 1;
				return preview({ title: "  Math homework  " });
			},
			mutate: async (...args) => {
				mutations.push(args);
				return acknowledged;
			},
		},
		10_000,
	);
	try {
		controller.setQuery("Math homework tomorrow 10AM");
		assert.equal(await controller.submit(controller.query), false);
		assert.deepEqual(mutations[0], [
			"create",
			null,
			{
				text: "/todo Math homework tomorrow 10AM",
				title: "Math homework",
				details: "Read pages 10–15",
				dueDate: "2026-11-13T02:00:00Z",
				includesDueTime: "true",
				course: "course-math",
			},
		]);
		assert.equal(controller.query, "Math homework tomorrow 10AM");
		assert.equal(controller.preview.title, "  Math homework  ");
		assert.match(controller.error, /refresh/);
		acknowledged = true;
		assert.equal(await controller.submit(controller.query), true);
		assert.equal(previews, 1);
		assert.equal(mutations.length, 2);
	} finally {
		controller.stop();
	}
});

test("a changed search survives a later save acknowledgment; thrown bridge errors keep the task editable", async () => {
	const saved = deferred();
	const controller = new LiveTaskCapture(
		{
			error: "",
			previewCommand: async () => preview(),
			mutate: () => saved.promise,
		},
		10_000,
	);
	try {
		controller.setQuery("Math homework tomorrow");
		const submitted = controller.submit(controller.query);
		await tick();
		controller.setQuery("Different task Friday");
		saved.resolve(true);
		assert.equal(await submitted, true);
		assert.equal(controller.query, "Different task Friday");
		assert.equal(controller.preview, null);
	} finally {
		controller.stop();
	}
	for (const failsDuringPreview of [true, false]) {
		const failed = new LiveTaskCapture(
			{
				error: "",
				previewCommand: async () => {
					if (failsDuringPreview) throw new Error("Unavailable");
					return preview();
				},
				mutate: async () => {
					throw new Error("Unavailable");
				},
			},
			10_000,
		);
		try {
			failed.setQuery("Math homework tomorrow");
			assert.equal(await failed.submit(failed.query), false);
			assert.equal(failed.query, "Math homework tomorrow");
			assert.equal(failed.saving, false);
			assert.match(failed.error, /Student Hub/);
			if (!failsDuringPreview)
				assert.equal(failed.preview.title, "Math homework");
		} finally {
			failed.stop();
		}
	}
});
