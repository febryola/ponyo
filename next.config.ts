import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const useQuickTunnel = isDevelopment && Boolean(process.env.PONYO_DEV_TUNNEL_ORIGIN);
const allowCloudflareQuickTunnel = process.env.PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL === "true";
const useLocalPreviewProxy = process.env.PONYO_LOCAL_PREVIEW === "true";

const nextConfig: NextConfig = {
	devIndicators: false,
	output: "standalone",
	// Keep the temporary mobile-preview dev cache separate from the local production build.
	...(useQuickTunnel ? { distDir: ".next-mobile-preview" } : {}),
	...(useQuickTunnel
		? {
				allowedDevOrigins: [
					new URL(process.env.PONYO_DEV_TUNNEL_ORIGIN!).hostname,
				],
			}
		: {}),
	...(allowCloudflareQuickTunnel
		? {
				experimental: {
					serverActions: {
						allowedOrigins: ["*.trycloudflare.com"],
					},
				},
			}
		: {}),
	async rewrites() {
		// Local-only API proxy for dev and the explicitly opted-in phone production preview.
		// Never enable it in ordinary/deployed production environments.
		const proxyEnabled =
			process.env.PONYO_DEV_API_PROXY === "true" &&
			(isDevelopment || useLocalPreviewProxy);
		if (!proxyEnabled) return [];
		return [
			{
				source: "/ponyo-api/v1/:path*",
				destination: `${process.env.PONYO_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:8000"}/v1/:path*`,
			},
		];
	},
};

export default nextConfig;
