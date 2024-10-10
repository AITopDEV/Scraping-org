const puppeteer = require("puppeteer");
const fs = require("fs");
require("dotenv").config();

const email = process.env.EMAIL;
const password = process.env.PASSWORD;

const rawData = fs.readFileSync("input.json");
const data = JSON.parse(rawData);
const oneDayInMs = 24 * 60 * 60 * 1000;

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

(async () => {
  // Open the browser
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  // Open a new page
  let page = await browser.newPage();
  await page.goto(`https://idocmarket.com/Security/Register`);

  // Login
  await page.waitForSelector("input#Login_Username");
  await page.type("input#Login_Username", email);
  await page.waitForSelector("input#Login_Password");
  await page.type("input#Login_Password", password);

  await page.waitForSelector('button[type="submit"]');
  await page.click('button[type="submit"]');

  const currentUrl = page.url();

  if (currentUrl === 'https://idocmarket.com/Security/Register?AspxAutoDetectCookieSupport=1') {
    const continueButton = (await page.$x("//a[contains(text(), 'Continue')]"))[0];

    if (continueButton) {
      // If the element is found, click it using page.evaluate()
      await page.evaluate((button) => button.click(), continueButton);
    } else {
      // If the element is not found, you can perform some other action, or skip
      console.log('Continue button not found. Skipping...');
    }
  } else {
    console.log('Current URL does not match. Skipping...');
  }


  await page.waitForSelector("a.reduce.btn.btn-primary.pull-right");
  await page.click("a.reduce.btn.btn-primary.pull-right");

  // let startDate = data.start_date;
  let startDate = fs.readFileSync("startPoint.txt", "utf8").trim();
  let increments = data.increments;
  let start_date = new Date(startDate);
  let end_date = new Date(startDate);
  end_date.setTime(start_date.getTime() + (increments - 1) * oneDayInMs);
  const today = new Date();

  console.log(start_date);
  console.log(end_date);
  console.log(today);

  while (end_date < today.getTime() + (increments - 1) * oneDayInMs) {
    // Input search field
    console.log(formatDate(start_date), " ~ ", formatDate(end_date));
    await page.waitForSelector('input[name="StartRecordDate"]');

    await page.type('input[name="StartRecordDate"]', formatDate(start_date));
    await page.keyboard.press("Enter");
    await delay(500);
    await page.type('input[name="EndRecordDate"]', formatDate(end_date));
    await page.keyboard.press("Enter");
    await delay(500);

    await page.click('input[name="StartRecordDate"]');
    await page.click('input[name="EndRecordDate"]');

    await page.click('input[value="Search"]');

    // Save the start point
    fs.writeFileSync("startPoint.txt", formatDate(start_date));

    // await page.waitForSelector("div.row.result-item");

    // If there is no search result, then skip that days period
    try {
      await page.waitForSelector("div.row.result-item", { timeout: 30000 });
    } catch (err) {
      console.error("No search results:", err);
      await page.click('input[value="« Back"]');
      await delay(1000);
      // Go to the next iteration of the while loop
      start_date = new Date(start_date.getTime() + increments * oneDayInMs);
      end_date = new Date(end_date.getTime() + increments * oneDayInMs);
      continue;
    }

    const rows = await page.$$("div.row.result-item");

    let data_page = [];
    for (const row of rows) {
      let data_row = [];
      const ibutton = await row.$("i.icon-circle-arrow-up");
      await ibutton.click();

      await delay(1000);

      try {
        await page.waitForSelector("div#preview-modal");
      } catch (err) {
        console.error("Modal did not appear in time:", err);
        continue; // skip to the next iteration of the loop
      }

      const modal = await page.$("div#preview-modal");

      try {
        await page.waitForSelector("div.modal-body h4");
      } catch (err) {
        console.error("h4 did not appear in time:", err);
        continue; // skip to the next iteration of the loop
      }

      // Scrap document_Type and Document_Number
      const modalBodyElement = await modal.$("div.modal-body");
      const h4element = await modalBodyElement.$("h4");
      if (h4element == null) {
        const documentType = "";
        const documentNumber = "";
      } else {
        const innerHTML = await page.evaluate((el) => el.innerText, h4element);
        [documentType, documentNumber] = innerHTML.split(/(?=#)/);
      }

      // Scrap book and page data
      const book_page = await modalBodyElement.$("h5");
      const book_page_text = await page.evaluate(
        (el) => (el ? el.innerText.match(/(\d+)/g) : null),
        book_page
      );

      if (book_page_text == null) {
        const book = "";
        const pageNum = "";
      } else[book, pageNum] = book_page_text;

      // Scrap other information
      let rowsInner = await page.$$(".row-fluid");

      let data = {};

      for (let i = 0; i < rowsInner.length; i++) {
        let text = await (
          await rowsInner[i].getProperty("textContent")
        ).jsonValue();
        if (text.includes("Doc Date:")) {
          data.docDate = text.split("Doc Date:").pop().trim();
        } else if (text.includes("Recorded:")) {
          data.recorded = text.split("Recorded:").pop().trim();
        } else if (text.includes("Pages:")) {
          data.pages = text.split("Pages:").pop().trim();
        } else if (text.includes("Grantors:")) {
          data.grantors = text.split("Grantors:").pop().trim();
        } else if (text.includes("Grantees:")) {
          data.grantees = text.split("Grantees:").pop().trim();
        } else if (text.includes("Notes:")) {
          data.notes = text.split("Notes:").pop().trim();
        } else if (text.includes("Legals:")) {
          data.legals = text.split("Legals:").pop().trim();
        } else if (text.includes("Related:")) {
          data.related = text.split("Related:").pop().trim();
        }
      }
      try {
        data_row.push(
          documentType.replace("\n", ""),
          documentNumber,
          data.docDate,
          data.recorded,
          data.pages,
          data.grantors
            .replace(/ +/g, " ")
            .replace(/\n/g, ",  ")
            .split("\n")
            .map((s) => s.trim())
            .join(", ") || " ",
          data.grantees
            .replace(/ +/g, " ")
            .replace(/\n/g, ",  ")
            .split("\n")
            .map((s) => s.trim())
            .join(", ") || " ",
          data.notes
            .replace(/ +/g, " ")
            .replace(/\n/g, ",  ")
            .split("\n")
            .map((s) => s.trim())
            .join(", ") || " ",
          data.legals
            .replace(/ +/g, " ")
            .replace(/\n/g, ",  ")
            .split("\n")
            .map((s) => s.trim())
            .join(", ") || " ",
          data.related
            .replace(/ +/g, " ")
            .replace(/\n/g, ",  ")
            .split("\n")
            .map((s) => s.trim())
            .join(", ") || " "
        );

        data_page.push(data_row);
      } catch (err) {
        console.error(err);
        start_date = new Date(start_date);
        start_date.setTime(start_date.getTime() + 1 * oneDayInMs);
        fs.writeFileSync("startPoint.txt", formatDate(start_date));

      }

      const closeButton = await modal.$(
        "a[href=\"javascript:closeDialog('#preview-modal');\"]"
      );
      await closeButton.click();
      await delay(1000);
    }

    await delay(1500);
    await page.click('input[value="« Back"]');

    // console.log(data_page);
    let csvData = data_page
      .map((data) => data.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    fs.appendFileSync(`output.csv`, csvData + "\n");
    console.log("[Success]: CSV updated");

    start_date = new Date(start_date);
    start_date.setTime(start_date.getTime() + increments * oneDayInMs);
    end_date = new Date(end_date);
    end_date.setTime(end_date.getTime() + increments * oneDayInMs);
  }
})();
