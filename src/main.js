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
    let domain = "unknown";
    try {
        domain = (new URL(url)).hostname.replace(/^www\./, "");
    } catch (_) {}
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`Scraping → ${url} (domaine détecté : ${domain || "default"})`);

    let result;
    try {
        result = await scraper(url);
    } catch (err) {
        console.error("Erreur fatale scraper :", err.message);
        result = {};
    }

    const { title = "", description = "", image = "", city = "", price = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result;

    if (!notion || !DATABASE_ID) return console.error("NOTION_TOKEN ou NOTION_DB_ID manquant");

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
        await notion.pages.update({ page_id: pageId, properties });
        console.log("Notion mise à jour avec succès");
    } catch (e) {
        console.error("Échec mise à jour Notion :", e.message);
    }
}

function buildValidUrl(input) {
    let s = input.trim().replace(/^https?:\/\/\/?/g, "").replace(/^www\./, "");

    if (s.startsWith("notion.so/")) s = s.slice(10);
    if (s.includes("https-")) s = s.split("https-")[1] || s;
    if (s.includes("http-")) s = s.split("http-")[1] || s;

    s = s.replace(/-/g, "/").replace(/\/+/g, "/");

    const isBienIci = s.includes("bienici.com");
    const isLBC = s.includes("leboncoin.fr");

    if (isBienIci) return "https://www.bienici.com/" + s.split("bienici.com")[1].split("?")[0].replace(/\/$/, "");
    if (isLBC) return "https://www.leboncoin.fr/" + s.split("leboncoin.fr")[1].split("?")[0].replace(/\/$/, "");

    if (s.match(/^[a-z0-9-]+\.com\/annonce|\/ad|\/vente|\/location/)) {
        const parts = s.split("/");
        return "https://www." + parts[0] + "/" + parts.slice(1).join("/").split("?")[0];
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
        console.error("URL impossible à reconstruire → arrêt propre");
        await run("https://erreur-url-invalide.com", pageId);
        process.exit(0);
    }

    console.log(`URL finale → ${url}`);
    await run(url, pageId);
})();