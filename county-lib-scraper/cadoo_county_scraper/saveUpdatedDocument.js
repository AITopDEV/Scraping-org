const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const path = require("path");
const { start } = require("repl");
require("dotenv").config();

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

function calculateLengthOfCSV(filePath) {
  if (!filePath) return 0;
  const csvString = fs.readFileSync(filePath, "utf-8");
  if (!csvString) return 0;
  const normalizedCsvString = csvString.replace(/\r\n/g, "\n");
  const rows = normalizedCsvString.split("\n");
  const filteredRows = rows.filter((row) => row.trim() !== "");
  return filteredRows.length;
}

function readCSVFile(filePath) {
  if (!filePath) return [];
  const csvString = fs.readFileSync(filePath, "utf-8");
  if (!csvString) return [];
  const normalizedCsvString = csvString.replace(/\r\n/g, "\n");
  const rows = normalizedCsvString.split("\n");

  // Filter out empty rows and convert each row to an array of fields
  const arrayWithFields = rows
    .filter((row) => row.trim() !== "")
    .map((row) => row.split(","));

  return arrayWithFields;
}

function getRowByIndex(parsedCSVData, rowIndex) {
  if (!parsedCSVData || !Array.isArray(parsedCSVData)) return [];
  return parsedCSVData[rowIndex] || [];
}

function createFolderIfNotExist(folderName) {
  const outputFolderPath = "_output";
  const targetFolderPath = path.join(outputFolderPath, folderName);

  if (!fs.existsSync(outputFolderPath)) {
    fs.mkdirSync(outputFolderPath);
  }

  if (!fs.existsSync(targetFolderPath)) {
    fs.mkdirSync(targetFolderPath);
  }
}

async function takeScreenshotAndCloseTab(page, folderName, clip) {
  try {
    let clickCount = 0;
    let canClick = true;

    const pageNumber = await page.$eval(
      "#pageCountBoxDocuVieware1",
      (el) => el.innerText
    );
    console.log(pageNumber, "pg");
    let i = 0;
    while (canClick) {
      // Capture screenshot and save it:
      i += 1;
      await page.screenshot({
        path: `_output/${folderName}/screenshot_${clickCount}.jpg`,
        clip: clip,
      });
      console.log(
        `Screenshot has been captured successfully in ${folderName}_click_${clickCount}`
      );
      if (i > pageNumber) {
        canClick = false;
        break;
      }

      try {
        // Wait for the "nextPageButtonDocuVieware1" button and check if it's not disabled
        const button = await page.waitForSelector('button[title="Next"]', {
          visible: true,
          timeout: 3000,
        });

        const isButtonDisabled = await page.$eval(
          'button[title="Next"]',
          (button) => button.disabled
        );

        if (!isButtonDisabled) {
          await button.click();
          await page.waitForTimeout(2000);
          clickCount++;
        } else {
          console.log("Button is disabled, stopping clicks.");
          canClick = false;
        }
      } catch (error) {
        console.log(`Button not found (${error.message}), stopping clicks.`);
        terminateAndRestart = true;
        canClick = false;
        break;
      }
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  } finally {
    const browser = page.browser();
    await page.close();

    if (!(await browser.pages()).length) {
      await browser.close();
    }
  }
}

const startDate = fs.readFileSync("startDate.txt", "utf8");
const endDate = new Date();
const startDateString = formatDate(startDate);
const endDateString = formatDate(endDate);

const lengthOfCSV = calculateLengthOfCSV(
  `caddo_${startDateString}_${endDateString}.csv`
);

async function startScript() {
  // Read data from input.json file
  const inputData = JSON.parse(fs.readFileSync("input.json"));
  let terminateAndRestart = false;

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized", "--start-fullscreen"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  // await page.setDefaultNavigationTimeout(60000); // Set to a higher value, e.g., 60000ms (60 seconds)

  // Navigate the page to a URL
  await page.keyboard.down("F11");
  await page.goto(
    "https://caddook.avenuinsights.com/Public/caddook/account/login"
  );

  await page.setViewport({ width: 1920, height: 1080 });

  // Fill in the email and password input field
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  await page.type("#Email", email);
  await page.type("#Password", password);

  // Click the login button
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click("#LoginBtn"),
  ]);

  // Use percentages to define clip size and position
  const viewportWidth = 1920;
  const viewportHeight = 1080;

  const clipXPercentage = 25;
  const clipYPercentage = 5;
  const clipWidthPercentage = 50;
  const clipHeightPercentage = 90;

  // Calculate x, y, width, and height based on viewport size
  const clipX = (viewportWidth * clipXPercentage) / 100;
  const clipY = (viewportHeight * clipYPercentage) / 100;
  const clipWidth = (viewportWidth * clipWidthPercentage) / 100;
  const clipHeight = (viewportHeight * clipHeightPercentage) / 100;

  const parsedCSVData = readCSVFile(
    `caddo_${startDateString}_${endDateString}.csv`
  );

  for (let i = 0; i < lengthOfCSV; i++) {
    const row = getRowByIndex(parsedCSVData, i);
    const bookID = row[0].replace(/"/g, "");
    if (bookID === "") {
      console.log(i);
      console.log("Cannot find the documentation");
    } else {
      const url = `https://caddook.avenuinsights.com/Public/caddook/Home/getFile?InstrumentID=${bookID}`;
      const folderName = `caddo_${row[8].replace(/"/g, "")}_${row[3].replace(
        /"/g,
        ""
      )}`;
      console.log(folderName);
      createFolderIfNotExist(folderName);

      // Create a new tab, you can use 'browser.newPage()' if you have the browser instance,
      // otherwise use 'page.browser().newPage()' if you have only the page instance.
      const newPage = await page.browser().newPage();
      await newPage.goto(url);
      await newPage.waitForTimeout(6000);

      // Define the clip dimensions
      const clip = {
        x: clipX,
        y: clipY,
        width: clipWidth,
        height: clipHeight,
      };

      // Take a screenshot and close the tab
      await console.log(i);

      const currentPageUrl = newPage.url();
      console.log(currentPageUrl);
      const specificUrl =
        "https://caddook.avenuinsights.com/Public/caddook/account/login";

      // If the current URL matches the specific URL, break the loop and restart the script
      if (currentPageUrl.includes(specificUrl)) {
        console.log(
          "The specific URL has been reached. Restarting the script."
        );
        terminateAndRestart = true;
        break;
      }

      await takeScreenshotAndCloseTab(newPage, folderName, clip);
    }
  }

  if (terminateAndRestart) {
    await browser.close();
    console.log("+++++++++++++++++");
    startScript();
  }

  // Print the full title
  console.log("OK");
  console.log(lengthOfCSV);
}

startScript();
