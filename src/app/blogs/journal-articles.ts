export type JournalArticle = {
	slug: string;
	previousSlugs: string[];
	label: string;
	title: string;
	excerpt: string;
	image: string;
	imageAlt: string;
	date: string;
	author: string;
	tags: string[];
	introduction: string[];
	shopCollection: { slug: string; title: string; matchTags: string[] };
	sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

// Editorial copy and ordering matched to Ponyo's Shopify journal, November 2026.
export const journalArticles: JournalArticle[] = [
	{
		slug: "love-it-longer-simple-ways-to-care-for-your-plush",
		previousSlugs: ["simple-ways-to-care-for-a-favorite"],
		label: "Care guide",
		title: "Love It Longer: Simple Ways to Care for Your Plush",
		excerpt: "A little care goes a long way. Easy everyday habits to keep your plush soft, fluffy and looking its best, from regular cuddlers to giant Domina friends.",
		image: "/images/catalog/ponyo-3.png",
		imageAlt: "An oversized bunny plush shown beside a person for scale",
		date: "2026-11-05",
		author: "Ponyo",
		tags: ["Care guide", "Domina XL", "Plush care"],
		shopCollection: { slug: "domina-xl", title: "XL Goodies", matchTags: ["domina", "xl"] },
		introduction: [
			"The best plush get loved a lot. They get hugged, carried around, sat on and sometimes taken on adventures. A little care keeps them soft, fluffy and ready for many more years of cuddles.",
			"Before anything else: always check the care label on your plush and the care details on its product page. Every plush is made differently, and its own instructions come first. The tips below are gentle, general habits that work alongside them.",
		],
		sections: [
			{ heading: "1. Give it a regular fluff", paragraphs: ["Plush can flatten where they are hugged or sat on most. Every week or two, give yours a gentle squeeze and shake to move the filling back into shape. For giant plush, work around the body section by section, like plumping a big pillow."] },
			{ heading: "2. Brush the fur", paragraphs: ["A soft clothes brush or a clean, dry soft toothbrush helps lift fur that has gone flat and removes dust. Brush gently in the direction of the fur. It is a two-minute job that makes a plush look new again."] },
			{ heading: "3. Spot clean little marks", paragraphs: ["For small marks, dab gently with a clean cloth that is barely damp. Do not scrub, as this can roughen the fabric. Let the area dry completely before cuddling again."] },
			{ heading: "4. Keep it out of strong sun", paragraphs: ["Long hours in direct sunlight can fade colours over time. If your plush lives by a window, move it out of the brightest spot or rotate it now and then."] },
			{ heading: "5. Let it breathe", paragraphs: ["Plush like fresh air too. Keep them in a dry place, away from damp corners and heaters. If you store a plush for a while, use a breathable cotton bag rather than sealed plastic, so it does not trap moisture."] },
			{ heading: "6. Extra care for giant plush", paragraphs: ["Domina XL plush are big friends with big needs. Give them a spot where they can sit upright without being squashed, fluff them a little more often, and lift rather than drag them when you move them around."] },
			{ heading: "7. Rare and collectible plush", paragraphs: ["If your plush is part of a collection, gentle display is the way to go. Keep it out of direct sun and dust it regularly. Keeping its tags and packaging can also be nice for collectors."] },
			{ heading: "A plush for every kind of love", paragraphs: ["Whether it is a daily cuddle buddy or a treasured collectible, a little care keeps it special. Looking for a new friend to look after? Explore New Arrivals or browse all plush on Ponyo."] },
		],
	},
	{
		slug: "look-closer-the-little-details-that-make-a-plush-special",
		previousSlugs: ["the-little-details-that-make-a-plush"],
		label: "Buying guide",
		title: "Look Closer: The Little Details That Make a Plush Special",
		excerpt: "Two plush can look the same in a photo and feel completely different in your arms. Here are the small details worth checking before you choose your next forever friend.",
		image: "/images/catalog/ponyo-5.png",
		imageAlt: "Close-up details of a soft teddy bear plush",
		date: "2026-11-05",
		author: "Ponyo",
		tags: ["Buying guide", "Premium plush", "Rare finds"],
		shopCollection: { slug: "premium", title: "Premium Plushies", matchTags: ["premium"] },
		introduction: [
			"Scroll through enough plush and they can start to blur together. Round eyes, soft fur, a cute smile. But anyone who has hugged a really good plush knows the difference straight away. It is in the little things.",
			"Here is what to look for, so you can spot a plush you will still love years from now.",
		],
		sections: [
			{ heading: "1. The face says everything", paragraphs: ["A plush's face is where its personality lives. Look at how the eyes and nose sit: are they even, balanced and placed with care? Tiny changes in spacing can make a character look sleepy, curious or cheeky. When a face feels just right, it is usually because someone paid attention to every millimetre."] },
			{ heading: "2. Shape and posture", paragraphs: ["Good plush hold their shape. Check whether the character sits or stands the way it should, and whether the ears, paws and tail look balanced. A well-shaped plush looks lovely on a shelf and stays huggable, instead of slumping into a lump after a few cuddles."] },
			{ heading: "3. How it feels to hold", paragraphs: ["Softness is not just about the fabric. It is about how the plush fills your arms. Some are squishy and cloud-like, others are firmer and more structured. Neither is better: it depends on whether you want a cuddle buddy, a pillow friend or a display piece. Product details on each listing help you picture how it will feel."] },
			{ heading: "4. Seams and finishing", paragraphs: ["Take a look where the pieces meet: around the ears, paws and neck. Neat, even seams are a sign of careful making and help a plush stay in good shape over time. Little touches like stitched details, ribbons or embroidered cheeks are where a plush goes from nice to special."] },
			{ heading: "5. Size in real life", paragraphs: ["A plush can look tiny or huge depending on the photo. Always check the measurements on the product page and picture it in your hands or your room. On Ponyo, plush are sorted into sizes from Mini to Domina XL, so you can find the scale that fits your life."] },
			{ heading: "6. Rarity and story", paragraphs: ["Some plush are made in small numbers or are simply hard to find. Part of the joy of collecting is owning a character that not everyone has. If a plush feels special to you, that is reason enough."] },
			{ heading: "Find a plush worth keeping", paragraphs: ["Explore our Premium Plush for favourites chosen for their detail, or hunt through Rare Finds for hard-to-find characters. Take a closer look, trust your heart, and choose the one that makes you smile."] },
		],
	},
	{
		slug: "go-big-or-go-home-how-to-choose-an-xl-plush-for-your-space",
		previousSlugs: ["choosing-an-xl-plush-for-your-space"],
		label: "Size guide",
		title: "Go Big or Go Home: How to Choose an XL Plush for Your Space",
		excerpt: "Dreaming of a giant plush but not sure it will fit? Here is how to pick the right Domina XL size for your room, from cosy 70 cm cuddlers to show-stopping 120 cm giants.",
		image: "/images/catalog/ponyo-3.png",
		imageAlt: "An oversized bunny plush shown beside a person for scale",
		date: "2026-11-05",
		author: "Ponyo",
		tags: ["Domina XL", "Giant plush", "Size guide"],
		shopCollection: { slug: "domina-xl", title: "XL Goodies", matchTags: ["domina", "xl"] },
		introduction: [
			"There is something magical about a plush that is almost as big as you are. A giant plush turns a corner into a reading nook, a bed into a cloud, and a gift into a moment nobody forgets. But before you fall in love with a 120 cm bear, it helps to know where it is going to live.",
			"Here is our simple guide to choosing the right XL plush from Domina, the giant plush side of Ponyo.",
		],
		sections: [
			{ heading: "1. Start with the spot, not the plush", paragraphs: [
				"Pick the exact place your plush will sit: the end of the bed, a sofa corner, a reading chair or the floor by the window. Then grab a tape measure and check the width and depth of that spot. A plush always looks bigger at home than it does in a photo, so measuring first saves surprises.",
				"Tip: lay a blanket or towel on the spot, folded to the size you measured. Leave it there for a day. If it feels right, you have found your size.",
			] },
			{ heading: "2. Know the Domina sizes", paragraphs: ["Domina giant plush range from 70 to 120 cm. Every product page shows the exact measurements, but here is a rough feel for each end of the range:"], bullets: [
				"Around 70 cm: a big, huggable friend that fits nicely on a bed or armchair. Great as a first giant plush or a gift.",
				"Around 90–100 cm: a proper statement piece. Perfect for sofas, floor cushions and photo corners.",
				"Up to 120 cm: the biggest hug in the room. Best for open floor space, kids' rooms with space to play, or anyone who wants a plush that steals the show.",
			] },
			{ heading: "3. Think about how you will use it", paragraphs: ["Will it be a cuddle buddy, a backrest, a room decoration or a gift? For daily cuddling and lounging, go for a size you can easily lift and move. For decoration and photos, bigger is more fun. For gifts, think about the space the person has, not just how exciting the box will look."] },
			{ heading: "4. Plan for moving day", paragraphs: ["Giant plush need a little planning when they arrive. Make sure the box can get through your door, up the stairs and into the room. Once unpacked, give your plush a gentle fluff so it settles into its full shape."] },
			{ heading: "5. Not sure? Compare with the smaller sizes", paragraphs: ["Many Ponyo plush come in more than one size, so you can compare a classic size with its XL version on the product page. If you love a character but space is tight, a smaller size gives you the same face with a lighter footprint."] },
			{ heading: "Ready to go big?", paragraphs: ["Browse the Domina XL collection to meet our giant plush, or explore all plush to find the right size for you. Whatever you choose, there is always room for one more friend."] },
		],
	},
];

export function getJournalArticle(slug: string) {
	return journalArticles.find((article) => article.slug === slug || article.previousSlugs.includes(slug));
}