export function formatPrice(amount: number, currency = "IDR") {
	const locale = currency === "JPY" ? "en-US" : "id-ID";
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount);
}
