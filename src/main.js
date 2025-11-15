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

async function updateNotion(pageId, properties) {
    if (!notion || !DATABASE_ID) return console.error("Notion non configuré");
    try {
        await notion.pages.update({ page_id: pageId, properties });
        console.log("Notion mise à jour");
    } catch (e) {
        console.error("Échec Notion :", e.message);
    }
}

async function run(url, pageId) {
    let domain = "unknown";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}

    const scraper = scrapers[domain] || defaultScraper;
    console.log(`Scraping → ${url} (domaine : ${domain || "default"})`);

    let result = {};
    let success = false;

    try {
        result = await scraper(url);
        success = true;
    } catch (err) {
        console.error("Échec scraper :", err.message);
    }

    const { title = "", description = "", image = "", city = "", price = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result;

    const properties = {
        "Avancement": { status: { name: "Annonce" } },
        "Scrapping": { select: { name: success ? "Scrappé" : "Erreur" } },
        "Prix": { rich_text: [{ text: { content: price } }] },
        "Prix/m2": { rich_text: [{ text: { content: pricePerM2 } }] },
        "Surface maison": { rich_text: [{ text: { content: surfaceHouse } }] },
        "Surface terrain": { rich_text: [{ text: { content: surfaceLand } }] },
        "Ville": { rich_text: [{ text: { content: city } }] },
        "URL": { url },
        ...(image && success && { cover: { external: { url: image } } }),
    };

    await updateNotion(pageId, properties);
}

function buildValidUrl(input) {
    let s = input.trim();

    if (s.startsWith("https://www.notion.so/")) s = s.slice(21);
    if (s.startsWith("http://www.notion.so/")) s = s.slice(20);

    s = s.replace(/https?-www-?/gi, "").replace(/https?-?/gi, "").replace(/-/g, "/");

    if (s.includes("bienici.com")) {
        const path = s.split("bienici.com")[1] || "";
        return "https://www.bienici.com" + path.split("?")[0].replace(/\/+$/, "");
    }
    if (s.includes("leboncoin.fr")) {
        const path = s.split("leboncoin.fr")[1] || "";
        return "https://www.leboncoin.fr" + path.split("?")[0].replace(/\/+$/, "");
    }

    return null;
}

(async () => {
    const raw = process.argv[2];
    const pageId = process.argv[3];

    if (!raw || !pageId) {
        console.error("Arguments manquants");
        process.exit(1);
    }

    const url = buildValidUrl(raw);

    if (!url) {
        console.error("URL impossible à reconstruire → marque Erreur");
        await updateNotion(pageId, {
            "Scrapping": { select: { name: "Erreur" } },
            "Avancement": { status: { name: "Annonce" } }
        });
        process.exit(0);
    }

    console.log(`URL finale → ${url}`);
    await run(url, pageId);
})();