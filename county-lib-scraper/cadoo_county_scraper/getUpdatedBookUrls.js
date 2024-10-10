const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const { parse } = require("date-fns");
require("dotenv").config();

const msPerDay = 24 * 60 * 60 * 1000;

async function scrapeAndSave(
  startDate,
  page,
  incrementDate,
  startDateStrings,
  endDateStrings
) {
  let dataForLoop = [];
  let nextPageExists = true;
  while (nextPageExists) {
    if (nextPageExists) {
      await page.evaluate(() => {
        const scrollableDiv = document.querySelector(
          ".k-grid-content.k-auto-scrollable"
        );
        if (scrollableDiv) {
          scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        }
      });

      await page.waitForTimeout(3000);

      const data = await page.evaluate(() => {
        const rows = document.querySelectorAll("tr.k-table-row.k-master-row");
        const result = [];

        rows.forEach((row) => {
          const rowData = [];
          const cells = row.querySelectorAll("td");

          cells.forEach((cell, cellIndex) => {
            if (!cell) {
              return;
            }
            let cellData;
            if (cellIndex === 0) {
              // Extract the number from the ViewImage function
              const link = cell.querySelector("a");
              const onclickAttr = link ? link.getAttribute("onclick") : "";
              const matchedNumbers = onclickAttr.match(/\d+/);
              const viewImageNum = matchedNumbers ? matchedNumbers[0] : "";
              cellData = viewImageNum;
            } else if (cellIndex === 3 || (cellIndex >= 5 && cellIndex <= 13)) {
              cellData = cell.innerText;
              // Replace newline characters with their escape code
              cellData = cellData.replace(/\n/g, "  and  ");
            } else {
              return;
            }

            rowData.push(cellData);
          });

          result.push(rowData);
        });

        return result;
      });
      dataForLoop.push(...data);
    }
    console.log(nextPageExists);
    nextPageExists = await scrapeNextPage(page);
  }
  const endDate = new Date(startDate);
  endDate.setTime(endDate.getTime() + incrementDate * msPerDay);
  const endDateString = `${
    endDate.getMonth() + 1
  }/${endDate.getDate()}/${endDate.getFullYear()}`;

  // Convert the data to the desired CSV format,
  const dataAsCsv =
    dataForLoop
      .map((value) => value.map((v) => `"${v}"`).join(","))
      .join("\n") + "\n";

  // Save the data to a CSV file
  try {
    fs.writeFile(
      `caddo_${startDateStrings}_${endDateStrings}.csv`,
      dataAsCsv,
      (err) => {
        if (err) {
          console.error("Error writing to file:", err);
        } else {
          console.log("Data saved to bookDataUpdated.csv");
        }
      }
    );
  } catch (err) {
    console.log("Error during scraping and saving", err);
  }

  console.log(`Found ${dataForLoop.length} matching rows.`);
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

  return [year, month, day].join("-");
};

async function scrapeNextPage(page) {
  const nextPageButton = await page.$(
    'button[aria-label="Go to the next page"]'
  );
  const isDisabled = await page.evaluate((button) => {
    return button.classList.contains("k-disabled");
  }, nextPageButton);

  if (!isDisabled) {
    await nextPageButton.click();
    return true;
  } else {
    return false;
  }
}

async function loopScraping(
  page,
  start_date,
  incrementDate,
  startDateStrings,
  endDateStrings
) {
  await page.evaluate(() => {
    document.querySelector("#StartDate").value = "";
  });
  await page.waitForSelector("#StartDate");
  await page.type("#StartDate", start_date);

  // Calculate the end date (7 days after the start date)g[shr]
  const endDate = new Date(start_date);
  endDate.setTime(endDate.getTime() + incrementDate * msPerDay);
  const endDateString = `${
    endDate.getMonth() + 1
  }/${endDate.getDate()}/${endDate.getFullYear()}`;

  // Input date in the EndDate field
  await page.evaluate(() => {
    document.querySelector("#EndDate").value = "";
  });
  await page.waitForSelector("#EndDate");
  await page.type("#EndDate", endDateString);

  // Click the "Search" button
  await page.waitForSelector("button[onclick='searchClick(event)']");
  await page.click("button[onclick='searchClick(event)']");

  await scrapeAndSave(
    start_date,
    page,
    incrementDate,
    startDateStrings,
    endDateStrings
  );
}

(async () => {
  const inputData = JSON.parse(fs.readFileSync("input.json"));
  const end_date = new Date();
  const start_date = new Date();
  const incrementDate = inputData.number_of_days;
  start_date.setDate(end_date.getDate() - incrementDate);
  console.log("start_date", start_date);
  console.log("end_date", end_date);
  const startDateStrings = formatDate(start_date);
  const endDateStrings = formatDate(end_date);

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  // await page.setDefaultNavigationTimeout(60000); // Set to a higher value, e.g., 60000ms (60 seconds)

  // Navigate the page to a URL
  await page.goto(
    "https://caddook.avenuinsights.com/Public/caddook/account/login"
  );

  await page.setViewport({ width: 1920, height: 1080 });

  // Fill in the email and password input field
  // const { email, password } = inputData;
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  await page.type("#Email", email);
  await page.type("#Password", password);

  // Click the login button
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click("#LoginBtn"),
  ]);

  // Click the dropdown button
  await page.waitForSelector("#divSearchCriteria .k-picker.k-dropdownlist");
  await page.click("#divSearchCriteria .k-picker.k-dropdownlist");

  // Click the 5th option
  await page.waitForTimeout(3000);
  await page.waitForSelector(
    "#SearchCriteria_listbox li[data-offset-index='4']"
  );
  await page.click("#SearchCriteria_listbox li[data-offset-index='4']");

  // let startDate = new Date(inputData.start_date);
  let startDate = new Date(start_date);

  while (true) {
    const endDate = new Date(startDate);
    const finalDate = new Date();
    console.log(endDate, incrementDate);
    endDate.setTime(endDate.getTime() + incrementDate * msPerDay);
    finalDate.setTime(end_date.getTime() + msPerDay);
    console.log(endDate, finalDate);

    if (endDate > finalDate) {
      break;
    }

    const startDateString = `${
      startDate.getMonth() + 1
    }/${startDate.getDate()}/${startDate.getFullYear()}`;

    await loopScraping(
      page,
      startDateString,
      incrementDate,
      startDateStrings,
      endDateStrings
    );
    fs.writeFileSync("startDate.txt", startDateString);

    startDate.setDate(startDate.getDate() + incrementDate);
  }

  await browser.close();

  // Print the full title
  console.log("OK");
})();
