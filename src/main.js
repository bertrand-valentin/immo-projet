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
    let domain = "unknown";
    try {
        domain = (new URL(url)).hostname.replace(/^www\./, "");
    } catch (_) {}
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`Utilisation du scraper : ${domain || "default"}`);
    const result = await scraper(url);
    const { title = "", description = "", image = "", city = "", price = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result || {};

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

function extractRealUrl(raw) {
    let str = raw.trim();

    if (str.startsWith("https://www.notion.so/")) str = str.slice(21);
    if (str.startsWith("http://www.notion.so/")) str = str.slice(20);

    const patterns = [
        /https?-www-([a-z0-9.-]+)-(.+)/i,
        /https?-([a-z0-9.-]+)-(.+)/i,
        /(bienici\.com\/.+)/i,
        /(leboncoin\.fr\/.+)/i,
        /([a-z0-9.-]+\.com\/.+)/i,
    ];

    for (const pattern of patterns) {
        const match = str.match(pattern);
        if (match) {
            let url = match[0].replace(/-/g, "/");
            url = url.replace(/^https?\//, "https://");
            if (!url.startsWith("http")) url = "https://" + url;
            if (url.includes("bienici.com") && !url.includes("www.")) url = url.replace("bienici.com", "www.bienici.com");
            if (url.includes("leboncoin.fr") && !url.includes("www.")) url = url.replace("leboncoin.fr", "www.leboncoin.fr");
            return url;
        }
    }

    const cleaned = str
        .replace(/https?:?\/?\/?/gi, "")
        .replace(/com?/gi, "com")
        .replace(/-/g, "/")
        .trim();
    return cleaned ? `https://www.${cleaned.split("/").slice(0, 3).join("/")}` : "https://www.bienici.com";
}

(async () => {
    const rawUrl = process.argv[2];
    const pageId = process.argv[3];

    if (!rawUrl || !pageId) {
        console.error("Usage: node src/main.js <url> <pageId>");
        process.exit(1);
    }

    const url = extractRealUrl(rawUrl);

    if (!url || url.length < 15 || url.includes("notion.so")) {
        console.error("URL invalide même après nettoyage :", rawUrl);
        console.log("Notion marqué comme Scrappé quand même (pour éviter les boucles infinies)");
        await run("https://www.bienici.com", pageId);
        return;
    }

    console.log(`Scraper l'URL : ${url}`);
    console.log(`Mettre à jour la page Notion : ${pageId}`);
    await run(url, pageId);
})();