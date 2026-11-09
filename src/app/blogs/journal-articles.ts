import locale from "@/ponyo-shopify/locales/en.default.json";

export type JournalArticle = {
	slug: string;
	label: string;
	title: string;
	excerpt: string;
	image: string;
	imageAlt: string;
	date: string;
	author: string;
	tags: string[];
	sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

const cdn = "https://ponyo-plushies.myshopify.com/cdn/shop/files/";

export const journalArticles: JournalArticle[] = [
	{
		slug: "choosing-an-xl-plush-for-your-space",
		label: locale.home.journal.card1_label,
		title: locale.home.journal.card1_title,
		excerpt:
			"A few simple measurements and styling ideas can help a larger-than-life plush feel right at home.",
		image: `${cdn}ponyo-3.png?v=1793843376`,
		imageAlt: "An oversized bunny plush shown beside a person for scale",
		date: "2026-10-28",
		author: "Ponyo Journal",
		tags: ["Domina", "Size guide", "Styling"],
		sections: [
			{
				heading: "Start with the spot, not the plush",
				paragraphs: [
					"Before choosing an XL friend, take a quick look at the space where it will live. Measure the floor area, check the height beneath shelves or windows, and leave enough room to walk around comfortably.",
					"A clear corner beside a reading chair or the end of a bed can make a generous plush feel intentional instead of crowded. A little breathing room also lets its shape and character stand out.",
				],
			},
			{
				heading: "Think about how the room is used",
				paragraphs: [
					"If the plush will be a reading companion, keep it near a comfortable seat. If it is part of a bedroom, make sure drawers, doors, and everyday pathways still open easily.",
					"For shared rooms, consider a spot that feels welcoming from more than one side. A soft rug or a favorite cushion can make the area feel like a small destination.",
				],
				bullets: [
					"Measure the available width and height.",
					"Keep doorways and walkways clear.",
					"Choose a place that is easy to reach and enjoy.",
				],
			},
			{
				heading: "Make it part of the room",
				paragraphs: [
					"A large plush can bring warmth to a quiet corner. Pair it with a nearby lamp, a throw, or a small basket for the things you like to keep close. Neutral textures help it blend in; a brighter accent makes it a cheerful focal point.",
					"Most of all, choose a place that makes you smile when you walk by. That is the best measure of a forever friend.",
				],
			},
		],
	},
	{
		slug: "the-little-details-that-make-a-plush",
		label: locale.home.journal.card2_label,
		title: locale.home.journal.card2_title,
		excerpt:
			"From soft finishes to thoughtful stitching, small details are what make a plush feel especially personal.",
		image: `${cdn}ponyo-5.png?v=1793843377`,
		imageAlt: "Close-up details of a soft teddy bear plush",
		date: "2026-10-21",
		author: "Ponyo Journal",
		tags: ["Premium", "Details", "Materials"],
		sections: [
			{
				heading: "A first impression you can feel",
				paragraphs: [
					"The texture is often the first thing you notice. A plush surface, a softly weighted shape, and a comfortable silhouette all contribute to that immediate feeling of welcome.",
					"Look closely at the finish in natural light. A consistent pile and neatly finished seams can tell you a lot about how carefully a piece has been put together.",
				],
			},
			{
				heading: "The character is in the details",
				paragraphs: [
					"An embroidered expression, a small color accent, or a distinctive pair of ears can give a plush its own personality. These details are often subtle, but they are what make one design feel different from another.",
					"If you are choosing a gift, think about the little things the recipient loves: a favorite animal, a calming color, or a playful shape that feels like them.",
				],
				bullets: [
					"Notice the face and expression.",
					"Check seams and decorative details.",
					"Choose a color and shape that feel personal.",
				],
			},
			{
				heading: "Find the one that feels right",
				paragraphs: [
					"There is no single checklist for a perfect plush. The right one is the piece you keep coming back to—the one that feels lovely to hold and brings a little warmth to the room.",
					"Take your time browsing. Sometimes a small detail is all it takes to find a new favorite.",
				],
			},
		],
	},
	{
		slug: "simple-ways-to-care-for-a-favorite",
		label: locale.home.journal.card3_label,
		title: locale.home.journal.card3_title,
		excerpt:
			"Gentle everyday habits can help a favorite plush stay fresh, soft, and ready for many more hugs.",
		image: `${cdn}ponyo-2.png?v=1793843375`,
		imageAlt: "A selection of plush characters arranged together",
		date: "2026-10-14",
		author: "Ponyo Journal",
		tags: ["Care notes", "Everyday tips"],
		sections: [
			{
				heading: "A little care goes a long way",
				paragraphs: [
					"For everyday dust, a gentle shake or a soft-bristled brush can help refresh the surface. Work slowly and follow the direction of the fabric so the pile keeps its texture.",
					"If a small spot appears, check the care label first. When spot cleaning is suitable, use a clean cloth with a little cool water and dab gently rather than rubbing the fabric.",
				],
			},
			{
				heading: "Let it dry naturally",
				paragraphs: [
					"After any damp cleaning, allow the plush to air-dry fully in a well-ventilated place. Avoid high heat unless the care instructions specifically say it is safe, since heat can affect fabrics and stuffing.",
					"For a deeper clean, always follow the product's sewn-in care label or ask the maker for guidance. Different materials and constructions may need different care.",
				],
				bullets: [
					"Read the care label before cleaning.",
					"Blot small marks gently; do not scrub.",
					"Air-dry thoroughly away from direct heat.",
				],
			},
			{
				heading: "Give it a cozy home",
				paragraphs: [
					"When your plush is not being cuddled, keeping it away from direct sunlight and excess moisture can help preserve its color and feel. A clean shelf, basket, or pillow can make a lovely resting spot.",
					"The best routine is a gentle one. A few thoughtful habits help keep a favorite close for all the moments still to come.",
				],
			},
		],
	},
];

export function getJournalArticle(slug: string) {
	return journalArticles.find((article) => article.slug === slug);
}
