import assert from "node:assert/strict";
import { test } from "bun:test";
import {
	fetchCurrencyConversion,
	parseCurrencyConversion,
	parseUnitConversion,
} from "./conversions";

function converted(query) {
	const result = parseUnitConversion(query);
	assert.equal(result?.kind, "comparison", query);
	return Number(result.right.value);
}

test("offline conversions accept aliases, signs, exponents and symbols", () => {
	assert.equal(converted("1 foot to cm"), 30.48);
	assert.equal(converted("1 mile in metres"), 1609.344);
	assert.equal(converted("1 lb to grams"), 453.59237);
	assert.equal(converted("-40 °C to °F"), -40);
	assert.equal(converted("273.15 kelvin to celsius"), 0);
	assert.equal(converted("1,000 m to km"), 1);
	assert.equal(converted("1e-9 m to mm"), 0.000001);
	assert.equal(converted("+.5 L to ml"), 500);
	assert.equal(converted("1 m² in cm^2"), 10000);
	assert.equal(converted("36 km/h to m/s"), 10);
	assert.equal(converted("36 kilometres per hour to meters per second"), 10);
	assert.equal(converted("1e308 km to km"), 1e308);
	assert.equal(converted("1 MB to b"), 8388608);
	assert.equal(converted("1 MW to W"), 1000000);
	assert.equal(converted("1 mW to W"), 0.001);
});

test("malformed, incompatible or overflowing input is never a unit conversion", () => {
	for (const query of [
		"Math Homework",
		"define metre",
		"1,23 m to cm",
		"1 m to kg",
		"1e309 m to cm",
		"1e308 km to mm",
		"1 m to no-such-unit",
		"1 to kg",
		"1..2 m to cm",
	]) {
		assert.equal(parseUnitConversion(query), null, query);
	}
});

test("currency recognition is offline and requires an explicit supported pair", () => {
	assert.deepEqual(parseCurrencyConversion("25 USD to CNY"), {
		amount: 25,
		from: "USD",
		to: "CNY",
	});
	assert.deepEqual(parseCurrencyConversion("$1,000 in eur"), {
		amount: 1000,
		from: "USD",
		to: "EUR",
	});
	assert.deepEqual(parseCurrencyConversion("-1.5 yuan to hk$"), {
		amount: -1.5,
		from: "CNY",
		to: "HKD",
	});
	for (const query of [
		"USD",
		"25 USD",
		"homework to USD",
		"25 BAD to USD",
		"1,23 USD to EUR",
		"1e999 USD to EUR",
	]) {
		assert.equal(parseCurrencyConversion(query), null, query);
	}
});

test("currency fetch sends only the pair, validates responses and caches rates", async () => {
	const originalFetch = globalThis.fetch;
	const urls = [];
	globalThis.fetch = async (url) => {
		urls.push(url);
		return {
			ok: true,
			json: async () => ({
				base: "USD",
				quote: "CNY",
				date: "2026-11-10",
				rate: 7,
			}),
		};
	};
	try {
		const result = await fetchCurrencyConversion({
			amount: 123.45,
			from: "USD",
			to: "CNY",
		});
		assert.equal(result.right.value, "864.15");
		assert.match(result.footer, /2026-11-10/);
		assert.deepEqual(urls, ["https://api.frankfurter.dev/v2/rate/usd/cny"]);
		const cached = await fetchCurrencyConversion({
			amount: 2,
			from: "USD",
			to: "CNY",
		});
		assert.equal(cached.right.value, "14");
		assert.equal(urls.length, 1);
		await fetchCurrencyConversion({ amount: 5, from: "EUR", to: "EUR" });
		assert.equal(urls.length, 1);
		await assert.rejects(
			fetchCurrencyConversion({ amount: 5, from: "JPY", to: "GBP" }),
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("currency network failure and cancellation reject cleanly", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error("offline");
	};
	try {
		await assert.rejects(
			fetchCurrencyConversion({ amount: 1, from: "AUD", to: "CAD" }),
		);
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			fetchCurrencyConversion(
				{ amount: 1, from: "AUD", to: "CAD" },
				controller.signal,
			),
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
