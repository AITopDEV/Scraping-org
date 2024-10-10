const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const { parse } = require('date-fns');
require("dotenv").config();

const msPerDay = 24 * 60 * 60 * 1000;

async function scrapeAndSave(startDate, page, incrementDate) {
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
  endDate.setTime(endDate.getTime() + (incrementDate - 1) * msPerDay);
  const endDateString = `${endDate.getMonth() + 1
    }/${endDate.getDate()}/${endDate.getFullYear()}`;

  // for (let i = 385; i < dataForLoop.length; i++) {
  //   dataForLoop[i].unshift(startDate, endDateString, dataForLoop.length);
  // }

  // Convert the data to the desired CSV format,
  const dataAsCsv = dataForLoop.map((value) => value.map((v) => `"${v}"`).join(",")).join("\n") + "\n";

  // Save the data to a CSV file
  try {
    fs.appendFile(`caddo_hist_2023-10-01_2023-11-28.csv`, dataAsCsv, (err) => {
      if (err) {
        console.error("Error writing to file:", err);
      } else {
        console.log("Data saved to bookData.csv");
      }
    });
  } catch (err) {
    console.log("Error during scraping and saving", err);
  }

  console.log(`Found ${dataForLoop.length} matching rows.`);
}

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

async function loopScraping(page, start_date, incrementDate) {
  await page.evaluate(() => {
    document.querySelector("#StartDate").value = "";
  });
  await page.waitForSelector("#StartDate");
  await page.type("#StartDate", start_date);

  // Calculate the end date (7 days after the start date)g[shr]
  const endDate = new Date(start_date);
  endDate.setTime(endDate.getTime() + (incrementDate - 1) * msPerDay);
  const endDateString = `${endDate.getMonth() + 1
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

  await scrapeAndSave(start_date, page, incrementDate);
}

(async () => {

  const inputData = JSON.parse(fs.readFileSync("input.json"));
  const start_date = inputData.start_date;
  const end_date = inputData.end_date;
  const incrementDate = inputData.increments;

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
    console.log(endDate, incrementDate)
    endDate.setTime(endDate.getTime() + (incrementDate - 1) * msPerDay);
    console.log(endDate, parse(end_date, "MM/dd/yyyy", new Date()));

    if (endDate > parse(end_date, "MM/dd/yyyy", new Date())) {
      break;
    }

    const startDateString = `${startDate.getMonth() + 1
      }/${startDate.getDate()}/${startDate.getFullYear()}`;

    await loopScraping(page, startDateString, incrementDate);
    fs.writeFileSync("startDate.txt", startDateString);

    startDate.setTime(startDate.getTime() + incrementDate * msPerDay);
  }

  await browser.close();

  // Print the full title
  console.log("OK");
})();
