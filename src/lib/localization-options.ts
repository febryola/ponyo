export type LanguageOption = {
	code: string;
	label: string;
	country: string;
	flag: string;
};
export type CurrencyOption = {
	code: string;
	label: string;
	country: string;
	flag: string;
	symbol: string;
	digits: number;
};
export type DeliveryCountryOption = {
	code: string;
	label: string;
	flag: string;
};

export const deliveryCountries: DeliveryCountryOption[] = [
	{ code: "JP", label: "Japan", flag: "🇯🇵" },
	{ code: "US", label: "United States", flag: "🇺🇸" },
	{ code: "GB", label: "United Kingdom", flag: "🇬🇧" },
	{ code: "AU", label: "Australia", flag: "🇦🇺" },
	{ code: "CA", label: "Canada", flag: "🇨🇦" },
];

export const languages: LanguageOption[] = [
	{ code: "en", label: "English", country: "United Kingdom", flag: "🇬🇧" },
	{ code: "ar", label: "العربية", country: "United Arab Emirates", flag: "🇦🇪" },
	{ code: "bg", label: "Български", country: "Bulgaria", flag: "🇧🇬" },
	{ code: "cs", label: "Čeština", country: "Czechia", flag: "🇨🇿" },
	{ code: "da", label: "Dansk", country: "Denmark", flag: "🇩🇰" },
	{ code: "de", label: "Deutsch", country: "Germany", flag: "🇩🇪" },
	{ code: "el", label: "Ελληνικά", country: "Greece", flag: "🇬🇷" },
	{ code: "es", label: "Español", country: "Spain", flag: "🇪🇸" },
	{ code: "es-ES", label: "Español (España)", country: "Spain", flag: "🇪🇸" },
	{ code: "fi", label: "Suomi", country: "Finland", flag: "🇫🇮" },
	{ code: "fr", label: "Français", country: "France", flag: "🇫🇷" },
	{ code: "he", label: "עברית", country: "Israel", flag: "🇮🇱" },
	{ code: "hr", label: "Hrvatski", country: "Croatia", flag: "🇭🇷" },
	{ code: "hu", label: "Magyar", country: "Hungary", flag: "🇭🇺" },
	{ code: "id", label: "Bahasa Indonesia", country: "Indonesia", flag: "🇮🇩" },
	{ code: "it", label: "Italiano", country: "Italy", flag: "🇮🇹" },
	{ code: "ja", label: "日本語", country: "Japan", flag: "🇯🇵" },
	{ code: "ko", label: "한국어", country: "South Korea", flag: "🇰🇷" },
	{ code: "lt", label: "Lietuvių", country: "Lithuania", flag: "🇱🇹" },
	{ code: "nb", label: "Norsk bokmål", country: "Norway", flag: "🇳🇴" },
	{ code: "nl", label: "Nederlands", country: "Netherlands", flag: "🇳🇱" },
	{ code: "pl", label: "Polski", country: "Poland", flag: "🇵🇱" },
	{ code: "pt-BR", label: "Português (Brasil)", country: "Brazil", flag: "🇧🇷" },
	{
		code: "pt-PT",
		label: "Português (Portugal)",
		country: "Portugal",
		flag: "🇵🇹",
	},
	{ code: "ro", label: "Română", country: "Romania", flag: "🇷🇴" },
	{ code: "ru", label: "Русский", country: "Russia", flag: "🇷🇺" },
	{ code: "sk", label: "Slovenčina", country: "Slovakia", flag: "🇸🇰" },
	{ code: "sl", label: "Slovenščina", country: "Slovenia", flag: "🇸🇮" },
	{ code: "sv", label: "Svenska", country: "Sweden", flag: "🇸🇪" },
	{ code: "th", label: "ไทย", country: "Thailand", flag: "🇹🇭" },
	{ code: "tr", label: "Türkçe", country: "Türkiye", flag: "🇹🇷" },
	{ code: "ur", label: "اردو", country: "Pakistan", flag: "🇵🇰" },
	{ code: "vi", label: "Tiếng Việt", country: "Vietnam", flag: "🇻🇳" },
	{ code: "zh-CN", label: "简体中文", country: "China", flag: "🇨🇳" },
	{ code: "zh-TW", label: "繁體中文", country: "Taiwan", flag: "🇹🇼" },
];

export const currencies: CurrencyOption[] = [
	{
		code: "JPY",
		label: "Japanese Yen",
		country: "Japan",
		flag: "🇯🇵",
		symbol: "¥",
		digits: 0,
	},
	{
		code: "USD",
		label: "US Dollar",
		country: "United States",
		flag: "🇺🇸",
		symbol: "$",
		digits: 2,
	},
	{
		code: "EUR",
		label: "Euro",
		country: "Euro area",
		flag: "🇪🇺",
		symbol: "€",
		digits: 2,
	},
	{
		code: "GBP",
		label: "British Pound",
		country: "United Kingdom",
		flag: "🇬🇧",
		symbol: "£",
		digits: 2,
	},
	{
		code: "AUD",
		label: "Australian Dollar",
		country: "Australia",
		flag: "🇦🇺",
		symbol: "A$",
		digits: 2,
	},
	{
		code: "CAD",
		label: "Canadian Dollar",
		country: "Canada",
		flag: "🇨🇦",
		symbol: "CA$",
		digits: 2,
	},
	{
		code: "IDR",
		label: "Indonesian Rupiah",
		country: "Indonesia",
		flag: "🇮🇩",
		symbol: "Rp",
		digits: 0,
	},
];

export const localeFilename: Record<string, string> = Object.fromEntries(
	languages.map(({ code }) => [
		code,
		code === "en" ? "en.default.json" : `${code}.json`,
	]),
);
