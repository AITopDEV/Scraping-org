const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const path = require("path");
const oneDayInMs = 24 * 60 * 60 * 1000;

const form_arg = process.argv[2];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to write record to CSV
// And each cell should be inside of "" to avoid the comma issue
async function writeRecordToCsv(record, outputPath) {
  const csvWriter = createCsvWriter({
    path: outputPath,
    header: Object.keys(record).map((key) => ({ id: key, title: key })),
    append: true,
    alwaysQuote: true,
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

// Function to export empty CSV
async function exportEmptyCSV(filename) {
  console.log("No data found, exporting empty CSV.");
  fs.writeFileSync(filename, ""); // Creates an empty file
}

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

function removeDuplicates(arr) {
  const unique = {};
  arr.forEach((item) => {
    const uniqueKey = `${item.api_number}_${item.doc_ID}`;
    unique[uniqueKey] = item;
  });
  return Object.values(unique);
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });
  let page = await browser.newPage();

  await page.goto(
    "https://public.occ.ok.gov/OGCDWellRecords/Login.aspx?showLogin=yes&&cr=1"
  );

  // Try selecting the "Sign Out" link
  const signOutSelector = '#SignOutDiv a[href*="Login.aspx?showLogin=yes"]';
  const signOutLink = await page.$(signOutSelector);

  if (signOutLink) {
    await signOutLink.click();
  } else {
    console.log("Sign Out link not found. Performing alternate action.");
  }

  await page.waitForSelector('input[name="LoginButton"]');
  await page.click('input[name="LoginButton"]');

  await page.goto(
    "https://public.occ.ok.gov/OGCDWellRecords/CustomSearch.aspx?SearchName=OilandGasWellRecordsSearch&dbid=0&repo=OCC"
  );

  // select 1000
  await page.waitForSelector("#OilandGasWellRecordsSearch_Input0");
  const dropdownSelector = "#OilandGasWellRecordsSearch_Input0";
  // select the dropdown
  if (form_arg === "1000") {
    console.log(form_arg);
    const optionValueToSelect = "1: '1000'";
    await page.select(dropdownSelector, optionValueToSelect);
  } else if (form_arg === "1001") {
    console.log(form_arg);
    const optionValueToSelect = "2: '1001'";
    await page.select(dropdownSelector, optionValueToSelect);
  } else {
    console.log(form_arg);
    const optionValueToSelect = "6: '1002A'";
    await page.select(dropdownSelector, optionValueToSelect);
  }

  // Input dates
  // dates interval: 8
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setTime(today.getTime() - 7 * oneDayInMs);

  await page.type(
    "input#OilandGasWellRecordsSearch_Input5",
    formatDate(yesterday, "/")
  );
  await page.type(
    "input#OilandGasWellRecordsSearch_Input5_end",
    formatDate(today, "/")
  );
  await delay(1000);
  await page.click(
    'input[class="btn btn-primary btn CustomSearchSubmitButton"]'
  );

  // wait until the table is loaded and if eroor occurs, export empty CSV
  console.log("Waiting for table to load.");
  try {
    // This waits for the first <tr> within the table or checks if no results exist
    await page.waitForSelector("tr[addweblink10classesrow]", {
      timeout: 10000,
    });
  } catch (error) {
    console.log("=====================================");
    console.log(
      "Timeout occurred waiting for table rows or no results indicator."
    );
    await exportEmptyCSV(
      `_output/occ_${form_arg}/occ_${form_arg}_${formatDate(
        yesterday,
        "-"
      )}_${formatDate(today, "-")}.csv`
    ); // If timeout occurs, export empty CSV
    await browser.close();
    return;
  }
  console.log("Table loaded.");
  console.log("=====================================");

  await autoScroll(page);

  // Scroll down inside the cdk-virtual-scroll-viewport element
  // Function to scroll to the bottom of the virtual scroll viewport
  const scrollToBottom = async () => {
    return page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const interval = 100; // ms
        let lastHeight = 0;
        const viewport = document.querySelector("cdk-virtual-scroll-viewport");

        if (!viewport) {
          reject("Viewport not found");
          return;
        }

        const timer = setInterval(() => {
          viewport.scrollTop += viewport.clientHeight; // Scroll by the height of the viewport

          const newHeight = viewport.scrollTop;
          if (newHeight === lastHeight) {
            // No new content loaded
            clearInterval(timer);
            resolve();
          } else {
            lastHeight = newHeight;
          }
        }, interval);
      });
    });
  };

  // Function to extract data from each <tr> inside the viewport
  const extractData = async () => {
    return page.$$eval(
      "cdk-virtual-scroll-viewport .p-datatable-table tr",
      (rows) => {
        return rows.map((row) => {
          const name =
            row.querySelector("td:nth-child(2) span")?.innerText.trim() ?? "";
          const url =
            "https://public.occ.ok.gov" +
              row.querySelector("td:nth-child(2) a")?.getAttribute("href") ??
            "";
          const form_number =
            row.querySelector("td:nth-child(3) span")?.innerText.trim() ?? "";
          const api_number =
            row.querySelector("td:nth-child(4) span")?.innerText.trim() ?? "";
          const well_name =
            row.querySelector("td:nth-child(5) span")?.innerText.trim() ?? "";
          const location =
            row.querySelector("td:nth-child(6) span")?.innerText.trim() ?? "";
          const county =
            row.querySelector("td:nth-child(7) span")?.innerText.trim() ?? "";
          const effective_date =
            row.querySelector("td:nth-child(8) span")?.innerText.trim() ?? "";
          const scan_date =
            row.querySelector("td:nth-child(9) span")?.innerText.trim() ?? "";
          const doc_ID =
            row.querySelector("td:nth-child(10) span")?.innerText.trim() ?? "";
          const relevance =
            row.querySelector("td:nth-child(11) span")?.innerText.trim() ?? "";

          return {
            name,
            url,
            form_number,
            api_number,
            well_name,
            location,
            county,
            effective_date,
            scan_date,
            doc_ID,
            relevance,
          };
        });
      }
    );
  };

  // Main loop to keep scrolling and extracting data until the end is reached
  let hasMore = true;
  let allData = [];
  while (hasMore) {
    const newData = await extractData();
    allData = allData.concat(newData);

    const beforeScrollHeight = await page.evaluate(
      () => document.querySelector("cdk-virtual-scroll-viewport").scrollTop
    );
    await scrollToBottom();
    const afterScrollHeight = await page.evaluate(
      () => document.querySelector("cdk-virtual-scroll-viewport").scrollTop
    );

    // If scrollTop hasn't changed, we are at the bottom
    if (beforeScrollHeight === afterScrollHeight) {
      hasMore = false;
    }
  }

  allData = removeDuplicates(allData);
  allData.shift();

  // Makew new folders if not exisited
  const directories = [
    "_output/occ_1000/pdf",
    "_output/occ_1001/pdf",
    "_output/occ_1002/pdf",
  ];
  directories.forEach((dir) => {
    // Use path.join to ensure correct path handling across operating systems
    const dirPath = path.join(__dirname, dir); // __dirname is the directory of the current module

    // Use fs.mkdir with recursive: true option to create the directory if it doesn't exist
    fs.mkdir(dirPath, { recursive: true }, (error) => {
      if (error) {
        // Handle any errors (e.g., permission issues)
        console.error(`Error creating directory "${dirPath}":`, error);
      }
    });
  });

  // save data into the csv file
  allData.map((cell) => {
    writeRecordToCsv(
      cell,
      `_output/occ_${form_arg}/occ_${form_arg}_${formatDate(
        yesterday,
        "-"
      )}_${formatDate(today, "-")}.csv`
    );
  });

  await browser.close();

  console.log(
    "Data saved to",
    `_output/occ_${form_arg}/occ_${form_arg}_${formatDate(
      yesterday,
      "-"
    )}_${formatDate(today, "-")}.csv`
  );
})();
