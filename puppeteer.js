import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';

import {config as immoweltConfig} from './lib/provider/immowelt.js';

const url = "https://www.immowelt.de/classified-search?distributionTypes=Buy,Buy_Auction,Compulsory_Auction&estateTypes=House,Apartment&locations=AD08DE2112&order=Default&m=homepage_new_search_classified_search_result";
puppeteer.use(StealthPlugin());

const enrichPage = async (page) => {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
};


//start
const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
});

let page = await browser.newPage();
await enrichPage(page);
page.on('request', request => {
    if (!request.isNavigationRequest()) {
        request.continue();
        return;
    }
    //important to set those fucking headers
    const headers = request.headers();
    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3';
    headers['Accept-Encoding'] = 'gzip';
    headers['Accept-Language'] = 'en-US,en;q=0.9,es;q=0.8';
    headers['Upgrade-Insecure-Requests'] = '1';
    headers['Referer'] = 'https://www.google.com/';
    request.continue({headers});
});
//Yes for fuck sake, we agree
await page.setCookie({
    name: 'CONSENT',
    value: `YES+cb.${new Date().toISOString().split('T')[0].replace(/-/g, '')}-04-p0.en-GB+FX+667`,
    domain: '.google.com'
});

await page.goto(url, {waitUntil: 'networkidle2'});

try {
    //no for fuck sake, we don't want your adds
    await page.$(`[aria-label="Reject all"]`);
    await Promise.all([
        page.click(`[aria-label="Reject all"]`),
        page.waitForNavigation({waitUntil: 'networkidle2'})
    ]);
} catch (err) {
    // Not logging this error, as it will be thrown if the Reject button may never appear.
    // This can be the case if it was previously rejected.
}

const content = await page.content();

const $ = cheerio.load(content);

$(immoweltConfig.crawlContainer).forEach(htmlContainer => {
    const container = cheerio.load(htmlContainer.html());
    Object.keys(immoweltConfig.crawlFields).forEach(crawlId => {
        const selector = immoweltConfig.crawlFields[crawlId];
        console.log(crawlId, container(selector).text());
    });
});
await page.close();
await browser.close();

