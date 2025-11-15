import { Client } from "@notionhq/client";
import leboncoinScraper from "./scrapers/leboncoin.js";
import bieniciScraper from "./scrapers/bienici.js";
import defaultScraper from "./scrapers/default.js";

const notion = process.env.NOTION_TOKEN && process.env.NOTION_DB_ID ? new Client({ auth: process.env.NOTION_TOKEN }) : null;

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

async function updateNotion(pageId, props) {
    if (!notion) return;
    try { await notion.pages.update({ page_id: pageId, properties: props }); }
    catch (e) { console.error("Notion error:", e.message); }
}

function buildUrl(raw) {
    let s = raw.trim();

    // 1. Virer le préfixe Notion complet
    s = s.replace(/^https?:\/\/(www\.)?notion\.so\//, "");

    // 2. Virer le "https-www-" ou "https-" du début
    s = s.replace(/^https?-www-/, "");
    s = s.replace(/^https?-/, "");

    // 3. Remettre les / à la place des -
    s = s.replace(/-/g, "/");

    // 4. Reconstruire proprement
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
    const rawUrl = process.argv[2];
    const pageId = process.argv[3];
    if (!rawUrl || !pageId) process.exit(1);

    const url = buildUrl(rawUrl);

    if (!url) {
        console.log("URL impossible → pastille rouge");
        await updateNotion(pageId, { "Scrapping": { select: { name: "Erreur" } } });
        process.exit(0);
    }

    console.log(`URL finale → ${url}`);

    let domain = "default";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}

    const scraper = scrapers[domain] || defaultScraper;

    let result = {};
    try {
        result = await scraper(url);
    } catch (e) {
        console.error("Scraper planté:", e.message);
        await updateNotion(pageId, { "Scrapping": { select: { name: "Erreur" } } });
        process.exit(0);
    }

    const { title = "", description = "", image = "", city = "", price = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result;

    const props = {
        "Avancement": { status: { name: "Annonce" } },
        "Scrapping": { select: { name: "Scrappé" } },
        "Prix": { rich_text: [{ text: { content: price } }] },
        "Prix/m2": { rich_text: [{ text: { content: pricePerM2 } }] },
        "Surface maison": { rich_text: [{ text: { content: surfaceHouse } }] },
        "Surface terrain": { rich_text: [{ text: { content: surfaceLand } }] },
        "Ville": { rich_text: [{ text: { content: city } }] },
        "URL": { url },
        ...(image ? { cover: { external: { url: image } } } : {})
    };

    await updateNotion(pageId, props);
})();