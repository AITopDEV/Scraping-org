const puppeteer = require("puppeteer");
const fs = require("fs");
const parse = require("csv-parse");

const oneDayInMs = 24 * 60 * 60 * 1000;

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

(async () => {
  const csvContent = fs.readFileSync("list.csv", "utf8");
  parse(csvContent, async (err, records) => {
    if (err) {
      console.log("Error parsing CSV:", err);
      return;
    }

    // Start browsing
    const browser = await puppeteer.launch({
      headless: false,
      args: ["--start-maximized"],
      timeout: 6000000,
      protocolTimeout: 6000000,
      defaultViewport: null,
    });
    const page = await browser.newPage();

    console.log(records);

    // let extractedUrls = [];
    for (const record of records) {
      console.log(record[0]); // First term (i.e., Adair)
      let today = new Date();
      let start_date = new Date();

      start_date.setTime(today.getTime() - 6 * oneDayInMs);

      try {
        await page.goto(
          `https://okcountyrecords.com/results/site=${
            record[0]
          }:recorded-start=${formatDate(start_date)}:recorded-end=${formatDate(
            today
          )}/page-1`
        );
        const resultNumber = await page.evaluate(() => {
          const resultStats =
            document.getElementById("result-stats").textContent;
          const numberWithCommas = resultStats.match(
            /\d{1,3}(,\d{3})*(\.\d+)?/
          )[0];
          const numberWithoutCommas = numberWithCommas.replace(/,/g, "");
          return parseInt(numberWithoutCommas);
        });

        console.log("Number of results:", resultNumber); // Output: 2723

        const dividedNumber = Math.ceil(resultNumber / 15);

        console.log(dividedNumber);
        for (let i = 1; i <= dividedNumber; i++) {
          await page.goto(
            `https://okcountyrecords.com/results/site=${
              record[0]
            }:recorded-start=${formatDate(
              start_date
            )}:recorded-end=${formatDate(today)}/page-${i}`
          );

          const urls = await page.evaluate(() => {
            // This function will be executed in the page context
            const tds = Array.from(
              document.querySelectorAll('td[class = "optional nowrap"]')
            ); // Get the specific tds
            const urls = tds
              .map((td) => {
                const a = td.querySelector("a");
                if (a && !a.href.includes("watermarked")) {
                  return a.href;
                }
                return null;
              })
              .filter((url) => url !== null);
            return urls;
          });
          const urlsArray = urls.join("\n");
          // console.log(urls);
          // extractedUrls = extractedUrls.concat(urls);

          fs.appendFile(
            `./daily_update/${record[0]}_urls.csv`,
            urlsArray + "\n",
            (err) => {
              if (err) {
                console.error("Error writing URL to output.csv:", err);
              }
            }
          );

          // console.log(urls);
        }
      } catch (err) {
        console.error(err);
      }
      start_date.setTime(start_date.getTime() + 7 * oneDayInMs);
    }

    await browser.close();
    console.log("==========Done==========");

    // Close the browser after fetching the result
  });
})();
