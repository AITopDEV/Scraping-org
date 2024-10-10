const fs = require("fs");
const puppeteer = require("puppeteer-extra");
const { waitForDownload } = require("puppeteer-utilz");
const { parse } = require("csv-parse");
const path = require("path");
const { delay } = require("puppeteer-utilz/lib/utils");
const https = require("https");
const oneDayInMs = 24 * 60 * 60 * 1000;

// A helper function to download the PDFs
const form_arg = process.argv[2];

// Function that formats the date to the format we need
const formatDate = (date, symbol) => {
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

  return [month, day, year].join(symbol);
};

// Get dates
const today = new Date();
const yesterday = new Date(today);
yesterday.setTime(today.getTime() - 7 * oneDayInMs);

// Get the file path of the CSV file
const csvFilePath = `G:\\occ\\occ_form\\_output\\occ_${form_arg}\\occ_${form_arg}_${formatDate(
  yesterday,
  "-"
)}_${formatDate(today, "-")}.csv`;

// A helper function to read and process the CSV file
const processCsv = async (filePath) => {
  const records = [];

  // Create a stream from the file (good for handling large files)
  const fileContent = fs.createReadStream(filePath).pipe(
    parse({
      columns: true, // Automatically infer columns from the first row
      trim: true, // Trim spaces around values
      skip_empty_lines: true,
    })
  );

  // Iterate over each record and extract the needed data
  for await (const record of fileContent) {
    const { url, api_number, doc_ID } = record;
    records.push({ url, api_number, doc_ID });
  }

  return records;
};

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  // Process the CSV file and extract the data
  const extractedData = await processCsv(csvFilePath);
  if (extractedData.length === 0) {
    console.log("No data found");
  } else {
    // Download PDFS
    for (const record of extractedData) {
      let page = await browser.newPage();
      await page._client().send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: `G:\\occ\\occ_form\\_output\\occ_${form_arg}\\pdf\\`,
      });

      const { url, api_number, doc_ID } = record;
      // Navigate to the page
      if (page) {
        await page.goto(url, { waitUntil: "networkidle2" });

        // Get the current pdf file name
        await page.waitForSelector("span.noBreadcrumbTitle");
        let pdfName = await page.$eval("span.noBreadcrumbTitle", (el) =>
          el.innerText.trim().replace("/", "_")
        );

        // Wait for the download button to appear
        try {
          await page.waitForSelector("#STR_DOWNLOAD", {
            visible: true,
            timeout: 15000,
          });
          await page.click("#STR_DOWNLOAD");
        } catch (e) {
          console.log("Big PDF file");
          await page.waitForSelector("#STR_DOWNLOAD_PDF", { visible: true });
          await page.click("#STR_DOWNLOAD_PDF");
          await page.waitForSelector(
            'button[lflocalize="STR_DOWNLOAD_PRINT"]',
            {
              visible: true,
            }
          );
          page.click('button[lflocalize="STR_DOWNLOAD_PRINT"]'); // Selector for the button to click
          await delay(5000);

          console.log(page.url());
          let pdfURL = page.url();
          await page.evaluate(
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
            `${pdfName}.pdf`
          );
          console.log("Download complete!");
          await page.close();
          continue;
        }
        // Get the name of the PDF

        console.log(pdfName);
        //   await delay(2000);
        // Click the download button

        // Wait for the download to complete and close the tab
        await waitForDownload(".");

        await delay(2000);
        await page.close();
        //Rename the file
        const oldPath = `G:\\occ\\occ_form\\_output\\occ_${form_arg}\\pdf\\${pdfName}.pdf`;
        const newPath = `G:\\occ\\occ_form\\_output\\occ_${form_arg}\\pdf\\occ_${form_arg}_${api_number}_${doc_ID}.pdf`;
        fs.rename(oldPath, newPath, (err) => {
          if (err) throw err;
        });
      }
    }
  }
  await browser.close();
  await console.log("Download complete!");
})();
