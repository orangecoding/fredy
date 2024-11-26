import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export default function createPuppeteerDriver() {
    return async function puppeteerDriver(context, callback) {
        const {url} = context;

        let browser;
        try {
            // Launch Puppeteer
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.goto(url, {waitUntil: 'networkidle2'});

            const result = await page.content();

            callback(null, result);
        } catch (error) {
            callback(error);
        } finally {
            if (browser) {
                console.log("browser close")
                await browser.close();
            }
        }
    };
}