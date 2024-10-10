const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
require("dotenv").config();
const { waitForDownload } = require("puppeteer-utilz");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const stealth = StealthPlugin();
puppeteer.use(StealthPlugin());
stealth.enabledEvasions.delete("iframe.contentWindow");

const oneDayInMs = 24 * 60 * 60 * 1000;

// Login credentials
const email = process.env.EMAIL;
const password = process.env.PASSWORD;

// Import the start date form the file
let startPoint = fs.readFileSync("startDate.txt", "utf8").trim();

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to write record to CSV
async function writeRecordToCsv(record, outputPath) {
    const csvWriter = createCsvWriter({
        path: outputPath,
        header: Object.keys(record).map((key) => ({ id: key, title: key })),
        append: true,
    });

    if (!fs.existsSync(outputPath)) {
        await csvWriter.writeRecords([
            Object.keys(record).reduce((obj, key) => {
                obj[key] = key;
                return obj;
            }, {}),
        ]);
    }
    await csvWriter.writeRecords([record]);
}

const formatDate = (date) => {
    const d = new Date(date);

    let month = "" + (d.getMonth() + 1);
    let day = "" + d.getDate();
    let year = d.getFullYear().toString();

    if (month.length < 2) {
        month = "0" + month;
    }
    if (day.length < 2) {
        day = "0" + day;
    }

    return [month, day, year].join("/");
};

const formatDate2 = (date) => {
    const d = new Date(date);

    let month = "" + (d.getMonth() + 1);
    let day = "" + d.getDate();
    let year = d.getFullYear().toString();

    if (month.length < 2) {
        month = "0" + month;
    }
    if (day.length < 2) {
        day = "0" + day;
    }

    return [month, day, year].join("-");
};

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        timeout: 6000000,
        protocolTimeout: 6000000,
        defaultViewport: null,
    });
    const page = await browser.newPage();
    await page.goto('https://acclaim.tulsacounty.org/AcclaimWeb/Account/Login');

    await page.waitForSelector('input[name="Username"]')
    await page.type('#Username', email);
    await page.type('#Password', password);

    await page.click('input[value="Log in"]');
    await page.goto('https://acclaim.tulsacounty.org/AcclaimWeb/Search/SearchTypeDocType');

    const today = new Date();
    const increments = 10;
    let startDate = new Date();

    startDate.setTime(today.getTime() - (increments - 1) * oneDayInMs);

    console.log(formatDate(startDate), "~", formatDate(today));
    // Input dates
    await page.waitForSelector('input[name="DateFrom"]');
    await page.click('input[name="DateFrom"]', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await page.type('input[name="DateFrom"]', formatDate(startDate));
    await page.click('input[name="DateTo"]', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await page.type('input[name="DateTo"]', formatDate(today));
    await page.click('input[name="DateFrom"]', { clickCount: 3 })
    await page.waitForSelector('#SearchBtn');
    await page.click('#SearchBtn');

    await delay(5000);
    console.log("====")
    try {
        let pageInfo = await page.$eval('.k-pager-info.k-label', elements => elements.innerText);
        console.log(pageInfo)
        let totalItems = pageInfo.split('of')[1].split('items')[0].trim();
        totalItems = parseInt(totalItems);
        console.log(totalItems);
        for (let iPage = 0; iPage < Math.ceil(totalItems / 50); iPage++) {
            try {
                let rows = await page.$$('tbody > tr');
                console.log(rows.length);

                for (let i = 0; i < rows.length; i++) {
                    console.log(i);
                    try {
                        let firstRowTexts = await page.$$eval(`tbody tr:nth-of-type(${i + 1}) td`, tds =>
                            tds.map(td => td.innerText.trim())
                        );
                        console.log(firstRowTexts);

                        await page.evaluate((i) => { document.querySelectorAll('tbody > tr')[i].click(); }, i);

                        // opens new page
                        let newTabPromise = new Promise((resolve) => browser.once('targetcreated', resolve));
                        let newTarget = await newTabPromise;
                        let newTab = await newTarget.page(); // Dereference the new target as a Page object.

                        // Wait for the selector in the context of the new tab.
                        if (newTab) {
                            await newTab.waitForSelector('#DocumentdetailsDiv > div');
                            let innerTexts = await newTab.evaluate(() => {
                                const divs = Array.from(document.querySelectorAll('#DocumentdetailsDiv > div')); // Select all divs directly under the DocumentdetailsDiv div
                                // Use a map to get innerText of the 3rd, 6th, and 7th divs
                                return [2, 5, 6].map(index => divs[index]?.innerText.split("\n")[1]);
                            });
                            console.log(innerTexts)

                            await newTab.waitForSelector('#undefined_wdv1_toolbar_Button_Save');
                            let newNewTabPromise = new Promise((resolve) => browser.once('targetcreated', resolve));
                            await newTab.click('#undefined_wdv1_toolbar_Button_Save')

                            // Open new tab again
                            let newNewTarget = await newNewTabPromise;
                            let newNewTab = await newNewTarget.page();

                            if (newNewTab) {
                                let pdfUrl = newNewTab.url();

                                // Download PDF
                                await newNewTab._client().send("Page.setDownloadBehavior", {
                                    behavior: "allow",
                                    downloadPath: "G:\\tulsa_county\\_output",
                                });

                                let pdfID = innerTexts[0];

                                await newNewTab.evaluate(
                                    (link, downloadedFileName) => {
                                        const a = document.createElement("a");
                                        a.href = link;
                                        a.download = downloadedFileName;
                                        a.style.display = "none";
                                        document.body.appendChild(a);
                                        a.click();
                                        console.log(link, "successfully downloaded!");
                                    },
                                    pdfUrl,
                                    `tulsa_${pdfID}_${firstRowTexts[3]}.pdf`
                                );
                                await waitForDownload("G:\\tulsa_county\\_output");
                                await newNewTab.close()
                            }

                            let data = {
                                'date_recorded': firstRowTexts[6],
                                'book_type': innerTexts[0],
                                'book/page': firstRowTexts[4],
                                'instrument#': firstRowTexts[3],
                                'secondary': innerTexts[1],
                                'total_pages': innerTexts[2],
                                'instrument_type': firstRowTexts[5],
                                'grantor': firstRowTexts[7],
                                'grantee': firstRowTexts[8],
                                'consideration': firstRowTexts[10],
                                'legal': firstRowTexts[9],
                            };

                            await writeRecordToCsv(data, `tulsa_${formatDate2(startDate)}_${formatDate2(today)}_.csv`);
                            await newTab.close();
                        }


                    } catch (e) {
                        console.error(e);
                    }
                }

                if (iPage < Math.ceil(totalItems / 50)) {
                    await page.click('a[aria-label="Go to the next page"]');
                }
            } catch (e) {
                console.error(e);
            }

        }
    } catch (e) {
        console.error(e);
    }




})();