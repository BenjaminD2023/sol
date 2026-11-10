import convert from "convert-units";
import type { TemporaryResult } from "../stores/ui.store.helpers";

type Conversion = { amount: number; from: string; to: string };

// Commas are accepted only as thousands separators, never silently discarded.
const CONVERSION_QUERY =
	/^([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(.+?)\s+(?:to|in|as|=)\s+(.+)$/i;

function parseConversion(query: string): Conversion | null {
	const match = query.trim().match(CONVERSION_QUERY);
	if (!match) return null;
	const amount = Number(match[1].replace(/,/g, ""));
	return Number.isFinite(amount)
		? { amount, from: match[2].trim(), to: match[3].trim() }
		: null;
}

export function formatConversionValue(value: number) {
	return Object.is(value, -0) ? "0" : Number(value.toPrecision(12)).toString();
}

const units = convert().list();
const aliases = new Map<string, string>();
for (const unit of units) {
	for (const name of [unit.singular, unit.plural]) {
		aliases.set(name.toLowerCase(), unit.abbr);
	}
}
for (const [name, unit] of Object.entries({
	metre: "m",
	metres: "m",
	kilometre: "km",
	kilometres: "km",
	centimetre: "cm",
	centimetres: "cm",
	millimetre: "mm",
	millimetres: "mm",
	feet: "ft",
	lbs: "lb",
	litre: "l",
	litres: "l",
	millilitre: "ml",
	millilitres: "ml",
	sec: "s",
	secs: "s",
	hr: "h",
	hrs: "h",
	celsius: "C",
	fahrenheit: "F",
	kelvin: "K",
	c: "C",
	f: "F",
	k: "K",
	mph: "m/h",
	kph: "km/h",
	kmh: "km/h",
	knots: "knot",
	"fl oz": "fl-oz",
	"fluid ounce": "fl-oz",
	"fluid ounces": "fl-oz",
	"square meter": "m2",
	"square meters": "m2",
	"square metre": "m2",
	"square metres": "m2",
	"square feet": "ft2",
	"square foot": "ft2",
	"square miles": "mi2",
	"square mile": "mi2",
	"cubic meter": "m3",
	"cubic meters": "m3",
	"cubic metre": "m3",
	"cubic metres": "m3",
}))
	aliases.set(name, unit);

function normalizeUnit(input: string) {
	const raw = input
		.replace(/°/g, "")
		.replace(/²/g, "2")
		.replace(/³/g, "3")
		.replace(/\^([23])/g, "$1")
		.replace(/\s+per\s+/gi, "/")
		.trim();
	// Symbols such as mW/MW and b/B carry meaning in their capitalization.
	const exact = units.find((unit) => unit.abbr === raw);
	if (exact) return exact.abbr;
	const alias = aliases.get(raw.toLowerCase());
	if (alias) return alias;
	const candidates = units.filter(
		(unit) => unit.abbr.toLowerCase() === raw.toLowerCase(),
	);
	return candidates.length === 1 ? candidates[0].abbr : null;
}

// Exact SI definitions avoid the rounded inter-system anchors in convert-units 2.
const exactFactors: Record<string, { dimension: string; factor: number }> = {};
for (const [dimension, factors] of Object.entries({
	length: {
		mm: 0.001,
		cm: 0.01,
		m: 1,
		km: 1000,
		in: 0.0254,
		ft: 0.3048,
		yd: 0.9144,
		mi: 1609.344,
	},
	mass: {
		mcg: 0.000001,
		mg: 0.001,
		g: 1,
		kg: 1000,
		oz: 28.349523125,
		lb: 453.59237,
		mt: 1000000,
		t: 907184.74,
	},
})) {
	for (const [unit, factor] of Object.entries(factors))
		exactFactors[unit] = { dimension, factor };
}

export function parseUnitConversion(query: string): TemporaryResult | null {
	const request = parseConversion(query);
	if (!request) return null;
	const from = normalizeUnit(request.from);
	const to = normalizeUnit(request.to);
	if (!from || !to) return null;
	try {
		const source = exactFactors[from];
		const target = exactFactors[to];
		const value =
			source && target && source.dimension === target.dimension
				? (request.amount * source.factor) / target.factor
				: convert(request.amount)
						.from(from as convert.Unit)
						.to(to as convert.Unit);
		if (!Number.isFinite(value)) return null;
		return {
			kind: "comparison",
			left: { label: from, value: formatConversionValue(request.amount) },
			right: { label: to, value: formatConversionValue(value) },
		};
	} catch {
		return null;
	}
}

// Bundled ISO codes keep recognition offline: ordinary search text never causes
// a currency request. Symbols with ambiguous meanings use the defaults below.
const currencies = new Set(
	"AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWG".split(
		" ",
	),
);
const currencyAliases: Record<string, string> = {
	$: "USD",
	us$: "USD",
	"us dollars": "USD",
	"us dollar": "USD",
	dollars: "USD",
	dollar: "USD",
	"€": "EUR",
	euro: "EUR",
	euros: "EUR",
	"£": "GBP",
	"british pounds": "GBP",
	"¥": "JPY",
	yen: "JPY",
	yuan: "CNY",
	rmb: "CNY",
	"cn¥": "CNY",
	hk$: "HKD",
	a$: "AUD",
	au$: "AUD",
	c$: "CAD",
	ca$: "CAD",
	s$: "SGD",
	"₹": "INR",
};
function normalizeCurrency(input: string) {
	const code = currencyAliases[input.toLowerCase()] ?? input.toUpperCase();
	return currencies.has(code) ? code : null;
}

export function parseCurrencyConversion(query: string): Conversion | null {
	// Also allow the common prefix form "$25 to EUR".
	const normalized = query.replace(
		/^\s*([$€£¥₹])\s*([+-]?[\d,.]+(?:e[+-]?\d+)?)/i,
		"$2 $1",
	);
	const request = parseConversion(normalized);
	if (!request) return null;
	const from = normalizeCurrency(request.from);
	const to = normalizeCurrency(request.to);
	return from && to ? { amount: request.amount, from, to } : null;
}

type Rate = { date: string; rate: number; fetchedAt: number };
const rateCache = new Map<string, Rate>();
const CACHE_DURATION = 6 * 60 * 60 * 1000;

export async function fetchCurrencyConversion(
	request: Conversion,
	signal?: AbortSignal,
): Promise<TemporaryResult> {
	const pair = `${request.from}/${request.to}`;
	let rate = rateCache.get(pair);
	let stale = false;
	if (request.from === request.to) {
		return {
			kind: "comparison",
			left: {
				label: request.from,
				value: formatConversionValue(request.amount),
			},
			right: {
				label: request.to,
				value: formatConversionValue(request.amount),
			},
			footer: "Same currency · no rate lookup needed",
		};
	}
	if (!rate || Date.now() - rate.fetchedAt > CACHE_DURATION) {
		try {
			// The amount and the user's full query stay on the device.
			const response = await fetch(
				`https://api.frankfurter.dev/v2/rate/${pair.toLowerCase()}`,
				{ signal },
			);
			if (!response.ok) throw new Error("Rate unavailable");
			const body = await response.json();
			if (
				body.base?.toUpperCase() !== request.from ||
				body.quote?.toUpperCase() !== request.to ||
				!/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
				typeof body.rate !== "number" ||
				!Number.isFinite(body.rate) ||
				body.rate <= 0
			)
				throw new Error("Invalid rate");
			rate = { date: body.date, rate: body.rate, fetchedAt: Date.now() };
			rateCache.set(pair, rate);
		} catch (error) {
			if (signal?.aborted || !rate) throw error;
			stale = true;
		}
	}
	const value = request.amount * rate.rate;
	if (!Number.isFinite(value)) throw new Error("Conversion is too large");
	return {
		kind: "comparison",
		left: { label: request.from, value: formatConversionValue(request.amount) },
		right: { label: request.to, value: formatConversionValue(value) },
		footer: `Frankfurter · reference rate ${rate.date}${stale ? " · cached, offline" : ""}`,
	};
}
