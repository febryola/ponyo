import type { Product } from "@/types/product";

export const PONYO_API_BASE_URL =
	process.env.NEXT_PUBLIC_PONYO_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiNotConfiguredError extends Error {
	constructor() {
		super("Ponyo API is not configured.");
		this.name = "ApiNotConfiguredError";
	}
}

export class ApiRequestError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly requestId?: string;

	constructor(
		message: string,
		status: number,
		code?: string,
		requestId?: string,
	) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}

export type CustomerProfile = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
};

export type BackendOrder = {
	id: string;
	orderNumber: string;
	createdAt: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	customerEmail?: string;
	deliveryAddress?: string;
	totalAmount: number;
	currency: string;
	items: Array<{
		id: string;
		name: string;
		image: string;
		imageAlt?: string;
		maker?: string;
		quantity: number;
		unitPrice: number;
		currency: string;
	}>;
};

export type CheckoutSessionInput = {
	email: string;
	shippingAddress: {
		firstName: string;
		lastName: string;
		address1: string;
		city: string;
		postalCode: string;
		countryCode: string;
	};
	shippingMethod: string;
	paymentMethod: "card" | "paypal" | "apple_pay";
	currency?: string;
	items: Array<{ variantId: string; quantity: number }>;
	successUrl: string;
	cancelUrl: string;
};

export type CheckoutSession = {
	checkoutUrl: string;
	orderId: string;
	expiresAt: string;
};

export type CheckoutReceipt = {
	orderId: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	totalAmount: number;
	currency: string;
};

type ApiEnvelope<T> = { data: T };
let cachedCsrfToken = "";

function readCsrfCookie() {
	if (typeof document === "undefined") return "";
	const value = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith("ponyo_csrf="));
	return value ? decodeURIComponent(value.slice("ponyo_csrf=".length)) : "";
}

async function ensureCsrfToken() {
	const cookieToken = readCsrfCookie();
	if (cookieToken) return cookieToken;
	if (cachedCsrfToken) return cachedCsrfToken;
	const response = await fetch(`${PONYO_API_BASE_URL}/v1/auth/csrf`, {
		credentials: "include",
		cache: "no-store",
		referrerPolicy: "no-referrer",
		headers: { Accept: "application/json" },
	});
	if (!response.ok)
		throw new ApiRequestError(
			"Unable to initialize a secure session.",
			response.status,
		);
	const payload = (await response.json()) as { data?: { csrfToken?: string } };
	cachedCsrfToken = payload.data?.csrfToken ?? readCsrfCookie();
	if (!cachedCsrfToken)
		throw new ApiRequestError("The API did not issue a CSRF token.", 403);
	return cachedCsrfToken;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
	const method = (init.method ?? "GET").toUpperCase();
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");
	if (init.body && !headers.has("Content-Type"))
		headers.set("Content-Type", "application/json");
	if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
		const token = await ensureCsrfToken();
		if (token) headers.set("X-CSRF-Token", token);
	}

	const response = await fetch(
		`${PONYO_API_BASE_URL}/v1${path.startsWith("/") ? path : `/${path}`}`,
		{
			...init,
			method,
			headers,
			credentials: "include",
			cache: "no-store",
			referrerPolicy: "no-referrer",
		},
	);

	let payload:
		| ApiEnvelope<T>
		| { error?: { code?: string; message?: string; request_id?: string } }
		| undefined;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	if (!response.ok) {
		const error = payload && "error" in payload ? payload.error : undefined;
		throw new ApiRequestError(
			error?.message ?? "The Ponyo service could not complete this request.",
			response.status,
			error?.code,
			error?.request_id,
		);
	}
	return (payload as ApiEnvelope<T>).data;
}

export const ponyoApi = {
	getLocalizationRates: (symbols = "USD,EUR,GBP,AUD,CAD,IDR") =>
		apiRequest<{ base: string; date: string; rates: Record<string, number> }>(
			`/localization/rates?symbols=${encodeURIComponent(symbols)}`,
		),
	listProducts: (query = "") => apiRequest<Product[]>(`/products${query}`),
	getProduct: (slug: string) =>
		apiRequest<Product>(`/products/${encodeURIComponent(slug)}`),
	login: async (email: string, password: string) => {
		const response = await apiRequest<{ customer: CustomerProfile }>(
			"/auth/login",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
			},
		);
		return response.customer;
	},
	register: async (input: {
		firstName: string;
		email: string;
		password: string;
		marketingOptIn: boolean;
		lastName: string;
	}) => {
		const response = await apiRequest<{ customer: CustomerProfile }>(
			"/auth/register",
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		);
		return response.customer;
	},
	requestPasswordReset: (email: string) =>
		apiRequest<{ accepted: boolean }>("/auth/password-reset", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	getMe: async () => {
		const response = await apiRequest<{ customer: CustomerProfile }>(
			"/auth/me",
		);
		return response.customer;
	},
	logout: () =>
		apiRequest<{ accepted: boolean }>("/auth/logout", { method: "POST" }),
	getOrders: async () => {
		return apiRequest<BackendOrder[]>("/orders");
	},
	createCheckoutSession: (input: CheckoutSessionInput) =>
		apiRequest<CheckoutSession>("/checkout/sessions", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	getCheckoutReceipt: (sessionId: string) =>
		apiRequest<CheckoutReceipt>(
			`/checkout/sessions/${encodeURIComponent(sessionId)}`,
		),
	subscribeNewsletter: (email: string) =>
		apiRequest<{ accepted: boolean }>("/newsletter/subscriptions", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	submitContactRequest: (input: {
		name: string;
		email: string;
		message: string;
		requestType?: string;
	}) =>
		apiRequest<{ accepted: boolean }>("/contact/requests", {
			method: "POST",
			body: JSON.stringify(input),
		}),
};
