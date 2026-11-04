export class OrderSubmissionNotConfiguredError extends Error {
	constructor() {
		super(
			"Order submission is disabled until the payment flow and supplier-routing rules are confirmed.",
		);
		this.name = "OrderSubmissionNotConfiguredError";
	}
}

/** Intentionally disabled for the MVP scaffold; do not persist or route orders yet. */
export async function createOrder(): Promise<never> {
	throw new OrderSubmissionNotConfiguredError();
}
