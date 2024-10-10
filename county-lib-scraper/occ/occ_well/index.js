const fs = require("fs");
const https = require("https");

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

function extractFileNameFromURL(url) {
  const urlObject = new URL(url);
  const pathname = urlObject.pathname;
  const fileName = pathname.split("/").pop();

  return fileName;
}

const downloadFile = (url, path) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlink(path);
        reject(err);
      });
  });
};

const today = new Date();

(async () => {
  // Make the folder for today if not existed
  await fs.mkdir(
    `_output\\${formatDate(today)}`,
    { recursive: true },
    (err) => {
      if (err) throw err;
      console.log("Folder created successfully!");
    }
  );

  // Download sheets
  let sheetUrls = [
    "https://oklahoma.gov/content/dam/ok/en/occ/documents/og/ogdatafiles/ITD-wells-formations-daily.xlsx",
    "https://oklahoma.gov/content/dam/ok/en/occ/documents/og/ogdatafiles/itd-wells-formations-data-dictionary.xlsx",
    "https://oklahoma.gov/content/dam/ok/en/occ/documents/og/ogdatafiles/completions-wells-formations-daily.xlsx",
    "https://oklahoma.gov/content/dam/ok/en/occ/documents/og/ogdatafiles/completions-wells-formations-data-dictionary.xlsx",
  ];

  for (let url of sheetUrls) {
    let parts = extractFileNameFromURL(url).split(".");

    const path =
      `G:\\occ\\occ_well\\_output\\${formatDate(today)}\\` +
      `${parts[0]}_${formatDate(today)}.${parts[1]}`; // Adjust path as needed
    await downloadFile(url, path);
    console.log(`Downloaded: ${path}`);
  }
})();
