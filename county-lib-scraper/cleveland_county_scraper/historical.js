const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const moment = require("moment");
const { waitForDownload } = require("puppeteer-utilz");

const stealth = StealthPlugin();
puppeteer.use(StealthPlugin());
stealth.enabledEvasions.delete("iframe.contentWindow");

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const inputFile = fs.readFileSync("input-historical.json", "utf8");
  const input = JSON.parse(inputFile);
  const startPoint = fs.readFileSync("startPoint.txt", "utf8").trim();

  let startDate = moment(startPoint, "MM/DD/YYYY");
  const endDate = moment(input.end_date, "MM/DD/YYYY");
  const increments = parseInt(input.increments, 10);

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page._client().send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "G:\\cleveland_county\\_output",
  });

  let flagger = 0;
  while (startDate.isBefore(endDate)) {
    console.log(startDate, endDate);

    await page.goto(
      "https://clerk.clevelandcountyok.com/web/action/ACTIONGROUP25S2"
    );
    if (flagger === 0) {
      await page.waitForSelector("#submitDisclaimerAccept");
      await page.click("#submitDisclaimerAccept");
    }
    flagger += 1;

    await page.waitForSelector(
      ".ss-action.ss-action-form.ss-utility-box.ss-action-page-search.ui-link"
    );
    const elements = await page.$$(
      ".ss-action.ss-action-form.ss-utility-box.ss-action-page-search.ui-link"
    );
    if (elements.length > 3) {
      await Promise.all([page.waitForNavigation(), elements[4].click()]);
    }

    // await page.goto('https://clerk.clevelandcountyok.com/web/search/DOCSEARCH25S5');

    const localEndDate = moment(startDate).add(increments - 1, "days");
    await page.waitForSelector("input#field_RecDateID_DOT_StartDate");
    await page.type(
      "input#field_RecDateID_DOT_StartDate",
      startDate.format("MM/DD/YYYY")
    );

    await page.waitForSelector("input#field_RecDateID_DOT_EndDate");
    await page.type(
      "input#field_RecDateID_DOT_EndDate",
      localEndDate.format("MM/DD/YYYY")
    );

    await page.waitForSelector("#searchButton");
    await page.click("#searchButton");

    try {
      await page.waitForSelector(
        "li.ss-search-row.ui-li-static.ui-body-inherit.ui-first-child"
      );

      // Get the number of pages
      let pageNum = await page.$$eval(
        ".selfServiceSearchResultHeaderLeft",
        (divs) => {
          let text = divs[1].innerText.split("for ")[1]; // Extract text after 'for'
          return parseInt(text);
        }
      );
      console.log(pageNum);
      await delay(1000);
      // Go to the first element
      const firstElement = await page.$(
        "li.ss-search-row.ui-li-static.ui-body-inherit.ui-first-child"
      );
      await firstElement.click();
      await delay(1000);
      const viewPDF = await page.$(
        "p.selfServiceSearchFullResult.selfServiceSearchResultNavigation"
      );
      await viewPDF.click();

      for (let i = 0; i < pageNum; i++) {
        console.log(i);
        try {
          await page.waitForSelector(
            "#documentIndexingInformation ul li.ui-li-static.ui-body-inherit"
          );

          await delay(2000);
          await page.waitForSelector("iframe.ss-pdfjs-lviewer");
          const elementHandle = await page.$("iframe.ss-pdfjs-lviewer");
          const frame = await elementHandle.contentFrame();
          await frame.waitForSelector("#numPages");

          let buttonSelector = "button#printCustom";
          await page.waitForSelector(buttonSelector);
          let buttonHandle = await page.$(buttonSelector);
          await delay(2000);
          let buttonHref = await page.evaluate(
            (button) => button.getAttribute("data-href"),
            buttonHandle
          );
          console.log(buttonHref);

          const data = await page.evaluate(() => {
            const documentType = document.querySelector(
              "#documentIndexingInformation ul li.ui-li-static.ui-body-inherit"
            )?.innerText;
            const documentNumber =
              document.querySelector(
                ".doc-viewer tr:nth-child(1) td div:nth-child(3)"
              )?.innerText || "";
            const recordingDate = document.querySelector(
              ".doc-viewer tr:nth-child(3) td div:nth-child(3)"
            )?.innerText;
            const numberPages = document.querySelector(
              ".doc-viewer tr:nth-child(4) td div:nth-child(3)"
            )?.innerText;
            const documentDate = document.querySelector(
              ".doc-viewer tr:nth-child(5) td div:nth-child(3)"
            )?.innerText;

            const granteesElement = document.querySelectorAll(
              "li.ui-li-static.ui-body-inherit.ui-last-child"
            )[2];
            const grantorElements = granteesElement
              .querySelectorAll("tr")[1]
              .querySelector("td")
              .querySelectorAll("div")[1];
            const granteeElements = granteesElement
              .querySelectorAll("tr")[2]
              .querySelector("td")
              .querySelectorAll("div")[1];

            const grantors = () => {
              // Check if 'ul' element exists within the target element
              let ulElement = grantorElements.querySelector("ul");
              if (ulElement) {
                // Get text of all 'li' items and join them with a comma
                let items = Array.from(
                  ulElement.querySelectorAll("li"),
                  (li) => li.innerText
                );
                return items.join(", ");
              }
              // If 'ul' does not exist just return the inner text of the target element
              return grantorElements.innerText;
            };
            const grantor = grantors();

            const grantees = () => {
              // Check if 'ul' element exists within the target element
              let ulElement = granteeElements.querySelector("ul");
              if (ulElement) {
                // Get text of all 'li' items and join them with a comma
                let items = Array.from(
                  ulElement.querySelectorAll("li"),
                  (li) => li.innerText
                );
                return items.join(", ");
              }
              // If 'ul' does not exist just return the inner text of the target element
              return granteeElements.innerText;
            };
            const grantee = grantees();

            const legalElements = document
              .querySelectorAll(
                ".selfservice-onecolumn.ss-utility-box-vertical.ss-listview.ui-listview.ui-listview-inset"
              )[2]
              .querySelectorAll("li");

            let legal = "";
            if (legalElements[0].innerText.includes("Legal")) {
              let tdElement = legalElements[1]
                .querySelectorAll("div")[1]
                .querySelector("ul");
              if (tdElement) {
                // Get text of all 'li' items and join them with a comma
                let items = Array.from(
                  tdElement.querySelectorAll("li"),
                  (li) => li.innerText
                );
                legal = items.join(", ");
              } else {
                legal = legalElements[1].querySelectorAll("div")[1].innerText;
              }
            }

            // return [documentType, documentNumber, recordingDate, numberPages, documentDate, granteeString, grantorString, legalString];
            return [
              documentType,
              documentNumber,
              recordingDate,
              numberPages,
              documentDate,
              grantor,
              grantee,
              legal,
            ];
          });

          // save tp CSV file
          // data.push(buttonHref)

          let csvData = data.map((el) => `"${el}"`).join(",") + "\n";
          fs.appendFileSync("historical.csv", csvData);

          // Download pdfs

          let pdfID = data[1];
          console.log(pdfID);
          let pdfURL = `https://clerk.clevelandcountyok.com${buttonHref}`;
          await frame.evaluate(
            (link, downloadedFileName) => {
              const a = document.createElement("a");
              a.href = link;
              a.download = downloadedFileName;
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              console.log(link, "successfully downloaded!");
            },
            pdfURL,
            `cleveland_${data[0]}_${pdfID}.pdf`
          );

          await waitForDownload(".");
          // await page.waitForEvent('download'); // This will wait for any download event
        } catch (err) {
          console.error("An error occurred during an iteration:", err);
        }
          // Go to next page
          const clickable = await page.$$(
            "a.ui-link.ui-btn.ui-btn-b.ui-btn-inline.ui-shadow.ui-corner-all"
          );
  
          if (clickable.length > 1) {
            console.log("===")
          await delay(1000); // Added delay before click to allow element to be ready
          await clickable[1].click();
          }

      }
    } catch (err) {
      console.log(err);
    }

    startDate.add(increments, "days");
    fs.writeFileSync("startPoint.txt", startDate.format("MM/DD/YYYY"));
    console.log(startDate);
  }
  await browser.close();
})();
