import type { NextConfig } from "next";

const ponyoMediaHost = process.env.PONYO_MEDIA_HOST?.trim();

const nextConfig: NextConfig = {
	devIndicators: false,
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "cdn.shopify.com",
				pathname: "/s/files/**",
			},
			{
				protocol: "https",
				hostname: "ponyo-plushies.myshopify.com",
				pathname: "/cdn/shop/files/**",
			},
			...(ponyoMediaHost
				? [
						{
							protocol: "https" as const,
							hostname: ponyoMediaHost,
							pathname: "/**",
						},
					]
				: []),
		],
	},
};

export default nextConfig;
