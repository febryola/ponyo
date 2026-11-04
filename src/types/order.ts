export type OrderStatus =
	| "pending_supplier_confirmation"
	| "confirmed"
	| "rejected"
	| "processing"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "refunded";

export type OrderRoutingStatus =
	| "pending"
	| "sent"
	| "accepted"
	| "rejected"
	| "fulfilled"
	| "failed";
