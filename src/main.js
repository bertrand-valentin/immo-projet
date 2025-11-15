import { Client } from "@notionhq/client";
import leboncoinScraper from "./scrapers/leboncoin.js";
import bieniciScraper from "./scrapers/bienici.js";
import defaultScraper from "./scrapers/default.js";

const notion = process.env.NOTION_TOKEN && process.env.NOTION_DB_ID ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
const DATABASE_ID = process.env.NOTION_DB_ID;

const scrapers = {
    "leboncoin.fr": leboncoinScraper,
    "bienici.com": bieniciScraper,
    "propietes-privees.com": defaultScraper,
    "immobilier.lefigaro.fr": defaultScraper,
    "immobilier.notaires.fr": defaultScraper,
    "seloger.com": defaultScraper,
    "paruvendu.fr": defaultScraper,
    "guy-hoquet.com": defaultScraper,
};

async function run(url, pageId) {
    console.log(`Scraping de : ${url}`);
    const domain = (new URL(url)).hostname.replace(/^www\./, "");
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`Utilisation du scraper : ${domain}`);
    const result = await scraper(url);
    const { title = "", description = "", image = "", city = "", price = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result;

    if (!notion || !DATABASE_ID) {
        console.error("Variables NOTION_TOKEN ou NOTION_DB_ID manquantes");
        return;
    }

    const properties = {
        "Avancement": { status: { name: "Annonce" } },
        "Scrapping": { select: { name: "Scrappé" } },
        "Prix": { rich_text: [{ text: { content: price } }] },
        "Prix/m2": { rich_text: [{ text: { content: pricePerM2 } }] },
        "Surface maison": { rich_text: [{ text: { content: surfaceHouse } }] },
        "Surface terrain": { rich_text: [{ text: { content: surfaceLand } }] },
        "Ville": { rich_text: [{ text: { content: city } }] },
        "URL": { url },
    };

    try {
        if (pageId) {
            await notion.pages.update({ page_id: pageId, properties });
        } else {
            await notion.pages.create({
                parent: { database_id: DATABASE_ID },
                properties,
                ...(image && { cover: { external: { url: image } } }),
            });
        }
        console.log("Notion OK");
    } catch (error) {
        console.error("Erreur Notion :", error.message);
    }
}

function extractRealUrl(input) {
    let str = input.trim();

    if (str.startsWith("https://www.notion.so/")) {
        str = str.slice(21);
    }

    const patterns = [
        /https?-www-([a-zA-Z0-9.-]+)-([a-zA-Z0-9-]+)/,
        /https?-([a-zA-Z0-9.-]+)-([a-zA-Z0-9-]+)/,
        /([a-zA-Z0-9.-]+\.com.+)/,
    ];

    for (const pattern of patterns) {
        const match = str.match(pattern);
        if (match) {
            const candidate = match[0].startsWith("http") ? match[0] : "https://" + match[0];
            if (candidate.includes("bienici.com") || candidate.includes("leboncoin.fr")) {
                return candidate.replace(/-/g, "/").replace("https//", "https://").replace("http//", "http://");
            }
        }
    }

    const clean = str
        .replace(/^https?:?\/?\/?/gi, "")
        .replace(/com?/gi, "com")
        .replace(/-/g, "/");
    return `https://www.${clean.split("/").slice(0, 3).join("/")}`;
}

(async () => {
    const rawUrl = process.argv[2];
    const pageId = process.argv[3];

    if (!rawUrl || !pageId) {
        console.error("Usage: node src/main.js <url> <pageId>");
        process.exit(1);
    }

    const url = extractRealUrl(rawUrl);
    console.log(`Scraper l'URL : ${url}`);
    console.log(`Mettre à jour la page Notion : ${pageId}`);
    await run(url, pageId);
})();