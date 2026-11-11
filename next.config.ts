import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	devIndicators: false,
	...(process.env.PONYO_DEV_TUNNEL_ORIGIN
		? { allowedDevOrigins: [new URL(process.env.PONYO_DEV_TUNNEL_ORIGIN).hostname] }
		: {}),
	async rewrites() {
		// Opt-in local testing only; production keeps its separately deployed API.
		if (process.env.NODE_ENV !== "development" || process.env.PONYO_DEV_API_PROXY !== "true") return [];
		return [{ source: "/ponyo-api/v1/:path*", destination: "http://127.0.0.1:8000/v1/:path*" }];
	},
};

export default nextConfig;
