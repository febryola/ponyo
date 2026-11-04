import { NextResponse } from "next/server";
import {
	createOrder,
	OrderSubmissionNotConfiguredError,
} from "@/services/order.service";

export async function POST() {
	try {
		await createOrder();
	} catch (error) {
		if (error instanceof OrderSubmissionNotConfiguredError) {
			return NextResponse.json({ error: error.message }, { status: 503 });
		}
		throw error;
	}

	return NextResponse.json(
		{ error: "Order submission could not be completed." },
		{ status: 500 },
	);
}
