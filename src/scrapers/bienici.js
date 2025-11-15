import axios from "axios";
import cheerio from "cheerio";

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
];

const axiosInstance = axios.create({
    timeout: 15000,
    headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
    },
});

export default async function bieniciScraper(url) {
    const headers = {
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    };

    try {
        console.log("Scraping BienIci →", url);
        const { data: html } = await axiosInstance.get(url, { headers });
        const $ = cheerio.load(html);

        const clean = (text) => text?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($('h1').first().text()) || clean($('meta[property="og:title"]').attr("content"));

        const price = clean($('span.price, div.price').first().text() || $('meta[property="product:price:amount"]').attr("content") || "");

        const image = $('meta[property="og:image"]').attr("content") ||
            $('img[data-testid="picture-image"]').first().attr("src") ||
            $('img.mainPhoto').attr("src") || "";

        const description = clean($('#description pre, div.description, section.description').text());

        const details = {};
        $('dt').each((_, el) => {
            const key = clean($(el).text()).toLowerCase().replace(":", "");
            const value = clean($(el).next('dd').text());
            if (key && value) details[key] = value;
        });
        $('div.detailItem, div.characteristic').each((_, el) => {
            const key = clean($(el).find('span').first().text()).toLowerCase().replace(":", "");
            const value = clean($(el).find('span').last().text());
            if (key && value) details[key] = value;
        });

        const surfaceHouse = details["surface"] || details["surface habitable"] || details["surf. habitable"] || "";
        const surfaceLand = details["surface terrain"] || details["terrain"] || details["parcelle"] || "";
        const rooms = details["pièces"] || "";
        const bedrooms = details["chambres"] || "";

        let city = "";
        const locationRaw = clean($('span.location, div.location').text() || $('h2').text());
        const cityMatch = locationRaw.match(/(\d{5})\s+(.+)/) || locationRaw.match(/(.+?)\s+\(\d{5}\)/);
        city = cityMatch ? (cityMatch[2] || cityMatch[1] || locationRaw) : clean(locationRaw.split(',')[0]);

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const phoneRaw = clean($('a.phoneNumber, button[data-testid="phone-button"], span.phone').text() || "");
        const phone = phoneRaw.match(/(\+?\d\s?[.-]?\d{3}[.-]?\d{3}[.-]?\d{4})/)?.[0] || "";

        console.log("BienIci scrapé avec succès →", { title, price, city, surfaceHouse, phone: phone ? "trouvé" : "non affiché" });

        return {
            title,
            description: description.slice(0, 1990),
            image,
            city: city.split(" - ")[0],
            price,
            pricePerM2,
            surfaceHouse,
            surfaceLand,
            phone: phone || "",
        };

    } catch (error) {
        console.error("Erreur BienIci scraper :", error.message);
        return {
            title: "Erreur scraping",
            description: "",
            image: "",
            city: "",
            price: "",
            pricePerM2: "",
            surfaceHouse: "",
            surfaceLand: "",
            phone: "",
        };
    }
}