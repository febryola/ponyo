import type { Product } from "@/types/product";

export const PONYO_API_BASE_URL =
	process.env.NEXT_PUBLIC_PONYO_API_BASE_URL?.replace(/\/$/, "") ?? "";

function apiUrl(path: string) {
	// Browsers use the same-origin proxy; Node fetch needs an absolute API URL.
	let base = PONYO_API_BASE_URL;
	if (typeof window === "undefined" && base.startsWith("/")) {
		base = (
			process.env.PONYO_API_SERVER_BASE_URL ??
			(process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "")
		).replace(/\/$/, "");
		if (!base || !/^https?:\/\//.test(base)) {
			throw new Error(
				"Set PONYO_API_SERVER_BASE_URL to an absolute backend URL when using a relative public API URL.",
			);
		}
	}
	return `${base}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

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

export type CustomerAddress = {
	id: string;
	firstName: string;
	lastName: string;
	address1: string;
	address2: string;
	city: string;
	region: string;
	postalCode: string;
	countryCode: string;
	phone: string;
	isDefault: boolean;
};

export type CustomerAddressInput = Omit<CustomerAddress, "id">;

export type CustomerCartInput = {
	currency: string;
	items: Array<{ variantId: string; quantity: number }>;
};

export type CartValidationInput = {
	currency: string;
	items: Array<{
		variantId: string;
		quantity: number;
		expectedPriceAmount?: number;
		expectedCurrency?: string;
	}>;
};

export type CartValidationLine = {
	variantId: string;
	productId: string | null;
	quantity: number;
	name: string;
	image: string | null;
	imageAlt: string | null;
	maker: string | null;
	slug: string | null;
	priceAmount: number | null;
	currency: string | null;
	availableQuantity: number;
	availability: "available" | "unavailable";
	issues: string[];
	priceChanged: boolean;
};

export type CartValidation = {
	items: CartValidationLine[];
	canCheckout: boolean;
	subtotalAmount: number;
	sourceCurrency: string | null;
};

export type CustomerCart = {
	id: string | null;
	currency: string;
	items: Array<{ variantId: string; quantity: number; productId?: string }>;
};

export type ProductReview = {
	id: string;
	reviewerName: string;
	rating: number;
	title: string;
	body: string;
	photos: string[];
	verifiedPurchase: boolean;
	createdAt: string;
};

export type ProductReviewSummary = {
	averageRating: number;
	reviewCount: number;
	reviews: ProductReview[];
};

export type BackendOrder = {
	id: string;
	orderNumber: string;
	createdAt: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	supplierFulfillmentStatus?: string;
	captureMethod?: string | null;
	capturedAmount?: number;
	refundedAmount?: number;
	customerEmail?: string;
	deliveryAddress?: string;
	trackingNumber?: string | null;
	trackingCarrier?: string | null;
	shipments?: BackendShipment[];
	subtotalAmount: number;
	discountAmount: number;
	shippingAmount: number;
	taxAmount: number;
	couponCode: string | null;
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
		productId?: string | null;
		variantId?: string | null;
		supplierOfferId?: string | null;
		productSnapshot?: Record<string, unknown>;
		discountAmount?: number;
		subtotalAmount?: number;
		totalAmount?: number;
	}>;
};

export type BackendShipment = {
	id: string;
	shipmentNumber: string;
	status: string;
	carrier: string;
	trackingNumber: string;
	trackingUrl: string | null;
	estimatedDeliveryAt: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	customerConfirmedAt: string | null;
	items: Array<{ orderItemId: string; quantity: number }>;
	events: Array<{
		status: string;
		source: string;
		occurredAt: string;
		note: string | null;
	}>;
};

export type PaymentTransaction = {
	id: string;
	orderId: string;
	provider: string;
	kind: string;
	status: string;
	amount: number;
	currency: string;
	providerReference: string | null;
	reason: string | null;
	errorCode: string | null;
	createdAt: string;
};

export type PaymentStatus = {
	orderId: string;
	provider: string;
	paymentStatus: string;
	orderStatus: string;
	totalAmount: number;
	currency: string;
	captureMethod: string | null;
	capturedAmount: number;
	refundedAmount: number;
	transactions: PaymentTransaction[];
};

export type OrderStatusHistoryEntry = {
	fromStatus: string | null;
	toStatus: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	source: string;
	createdAt: string;
};

export type CheckoutSessionInput = {
	idempotencyKey: string;
	email: string;
	shippingAddress: {
		firstName: string;
		lastName: string;
		address1: string;
		address2?: string;
		region?: string;
		city: string;
		postalCode: string;
		countryCode: string;
		phone?: string;
	};
	shippingMethod: string;
	paymentMethod: "card" | "paypal" | "apple_pay";
	currency?: string;
	items: Array<{
		variantId: string;
		quantity: number;
		expectedPriceAmount?: number;
		expectedCurrency?: string;
	}>;
	successUrl: string;
	cancelUrl: string;
	couponCode?: string;
	expectedTotalAmount?: number;
};

export type CheckoutQuoteInput = Omit<
	CheckoutSessionInput,
	"expectedTotalAmount" | "idempotencyKey"
>;

export type CheckoutQuote = {
	subtotalAmount: number;
	discountAmount: number;
	shippingAmount: number;
	taxAmount: number;
	totalAmount: number;
	currency: string;
	couponCode: string | null;
	taxRateBps: number;
};

export type CheckoutSession = Omit<CheckoutQuote, "taxRateBps"> & {
	taxRateBps?: number;
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
	const response = await fetch(apiUrl("/auth/csrf"), {
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

async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	csrf = true,
): Promise<T> {
	if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
	const method = (init.method ?? "GET").toUpperCase();
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");
	if (init.body && !headers.has("Content-Type"))
		headers.set("Content-Type", "application/json");
	if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) {
		const token = await ensureCsrfToken();
		if (token) headers.set("X-CSRF-Token", token);
	}

	const response = await fetch(apiUrl(path), {
		...init,
		method,
		headers,
		credentials: "include",
		cache: "no-store",
		referrerPolicy: "no-referrer",
	});

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
	// Public, read-only POST: no authentication or CSRF bootstrap is needed.
	validateCart: (input: CartValidationInput) =>
		apiRequest<CartValidation>(
			"/cart/validate",
			{
				method: "POST",
				body: JSON.stringify(input),
			},
			false,
		),
	getCart: () => apiRequest<CustomerCart>("/cart"),
	updateCart: (input: CustomerCartInput) =>
		apiRequest<CustomerCart>("/cart", {
			method: "PUT",
			body: JSON.stringify(input),
		}),
	getLocalizationRates: (symbols = "USD,EUR,GBP,AUD,CAD,IDR") =>
		apiRequest<{ base: string; date: string; rates: Record<string, number> }>(
			`/localization/rates?symbols=${encodeURIComponent(symbols)}`,
		),
	listProducts: (query = "", locale = "en") => {
		const params = new URLSearchParams(
			query.startsWith("?") ? query.slice(1) : query,
		);
		params.set("locale", locale);
		return apiRequest<Product[]>(`/products?${params.toString()}`);
	},
	getProduct: (id: string, locale = "en") =>
		apiRequest<Product>(
			`/products/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`,
		),
	getProductReviews: (productId: string) =>
		apiRequest<ProductReviewSummary>(
			`/products/${encodeURIComponent(productId)}/reviews`,
		),
	submitProductReview: (
		productId: string,
		input: { rating: number; title: string; body: string; photos?: string[] },
	) =>
		apiRequest<ProductReview>(
			`/products/${encodeURIComponent(productId)}/reviews`,
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		),
	joinProductWaitlist: (
		productId: string,
		input: { email: string; firstName: string },
	) =>
		apiRequest<{ accepted: boolean }>(
			`/products/${encodeURIComponent(productId)}/waitlist`,
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		),
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
		const response = await apiRequest<{
			accepted: boolean;
			emailVerificationRequired: boolean;
		}>("/auth/register", {
			method: "POST",
			body: JSON.stringify(input),
		});
		return response;
	},
	requestPasswordReset: (email: string) =>
		apiRequest<{ accepted: boolean }>("/auth/password-reset", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	resendVerificationEmail: (email: string) =>
		apiRequest<{ accepted: boolean }>("/auth/verify-email/resend", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	verifyEmail: (token: string) =>
		apiRequest<{ accepted: boolean }>("/auth/verify-email/confirm", {
			method: "POST",
			body: JSON.stringify({ token }),
		}),
	confirmPasswordReset: (token: string, password: string) =>
		apiRequest<{ accepted: boolean }>("/auth/password-reset/confirm", {
			method: "POST",
			body: JSON.stringify({ token, password }),
		}),
	getMe: async () => {
		const response = await apiRequest<
			CustomerProfile | { customer: CustomerProfile }
		>("/auth/me");
		return "customer" in response ? response.customer : response;
	},
	updateMe: async (input: { firstName: string; lastName: string }) => {
		const response = await apiRequest<
			CustomerProfile | { customer: CustomerProfile }
		>("/auth/me", { method: "PATCH", body: JSON.stringify(input) });
		return "customer" in response ? response.customer : response;
	},
	getAddresses: () => apiRequest<CustomerAddress[]>("/auth/addresses"),
	createAddress: (input: CustomerAddressInput) =>
		apiRequest<CustomerAddress>("/auth/addresses", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	updateAddress: (id: string, input: CustomerAddressInput) =>
		apiRequest<CustomerAddress>(`/auth/addresses/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),
	deleteAddress: (id: string) =>
		apiRequest<{ accepted: boolean }>(
			`/auth/addresses/${encodeURIComponent(id)}`,
			{
				method: "DELETE",
			},
		),
	getWishlist: () => apiRequest<{ productSlugs: string[] }>("/auth/wishlist"),
	updateWishlist: (productSlugs: string[]) =>
		apiRequest<{ productSlugs: string[] }>("/auth/wishlist", {
			method: "PUT",
			body: JSON.stringify({ productSlugs }),
		}),
	logout: () =>
		apiRequest<{ accepted: boolean }>("/auth/logout", { method: "POST" }),
	getOrders: async () => {
		return apiRequest<BackendOrder[]>("/orders");
	},
	getOrder: (id: string) =>
		apiRequest<BackendOrder>(`/orders/${encodeURIComponent(id)}`),
	getPaymentStatus: (id: string) =>
		apiRequest<PaymentStatus>(`/payments/orders/${encodeURIComponent(id)}`),
	syncPaymentStatus: (id: string) =>
		apiRequest<PaymentStatus>(
			`/payments/orders/${encodeURIComponent(id)}/sync`,
			{
				method: "POST",
				body: JSON.stringify({}),
			},
		),
	getOrderHistory: (id: string) =>
		apiRequest<OrderStatusHistoryEntry[]>(
			`/orders/${encodeURIComponent(id)}/history`,
		),
	confirmShipmentDelivery: (orderId: string, shipmentId: string) =>
		apiRequest<BackendShipment>(
			`/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}/confirm-delivery`,
			{ method: "POST", body: JSON.stringify({}) },
		),
	cancelOrder: (id: string, input: { reason?: string } = {}) =>
		apiRequest<BackendOrder>(`/orders/${encodeURIComponent(id)}/cancel`, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	getCheckoutQuote: (input: CheckoutQuoteInput) =>
		apiRequest<CheckoutQuote>("/checkout/quote", {
			method: "POST",
			body: JSON.stringify(input),
		}),
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
		apiRequest<{
			accepted: boolean;
			emailNotificationSent: boolean;
			notificationEmail: string;
		}>("/contact/requests", {
			method: "POST",
			body: JSON.stringify(input),
		}),
};
