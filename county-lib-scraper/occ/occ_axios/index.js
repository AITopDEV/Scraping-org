const axios = require("axios");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const oneDayInMs = 24 * 60 * 60 * 1000;
const today = new Date();
const yesterday = new Date(today);
yesterday.setTime(today.getTime() - 7 * oneDayInMs);

// function to format date
const formatDate = (date, symbol) => {
  const d = new Date(date);

  let month = "" + (d.getMonth() + 1);
  let day = "" + d.getDate();
  let year = d.getFullYear().toString();

  return [month, day, year].join(symbol);
};

// delay function
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// function that searches records for specific date range
async function search(
  startDate,
  endDate,
  startIdx,
  endIdx,
  getNewListing,
  searchUuid = ""
) {
  var data = JSON.stringify({
    repoName: "OCC",
    searchSyn: `({[]:[ECF Case Type]="Conservation Docket"} & {[]:[ECF Docket Date]>="${startDate}", [ECF Docket Date]<="${endDate}"} & ({LF:LOOKIN="\\AJLS\\Judicial & Legislative\\ECF"}) & {LF:templateid=52})`,
    searchUuid,
    sortColumn: "",
    startIdx,
    endIdx,
    getNewListing,
    sortOrder: 2,
    displayInGridView: false,
  });

  var config = {
    method: "post",
    url: "https://public.occ.ok.gov/WebLink/SearchService.aspx/GetSearchListing",
    headers: {},
    data: data,
  };
  const response = await axios(config);
  return response.data;
}

const getBasicDocumentInfo = async (entryId) => {
  try {
    const response = await axios({
      method: "post",
      url: "https://public.occ.ok.gov/WebLink/DocumentService.aspx/GetBasicDocumentInfo",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        Cookie:
          "BIGipServer~ONE-ARMED-PUBLIC~occ_public.occ.ok.gov.app~occ_public.occ.ok.gov_pool=rd5o00000000000000000000ffffac1ee676o443; AcceptsCookies=1; WebLinkSession=dppbvpubu5vsietlop402vne; MachineTag=31554aa4-5706-4ae3-b963-fc344ead6d82; lastSessionAccess=638436451956228750",
        Origin: "https://public.occ.ok.gov",
        Referer:
          "https://public.occ.ok.gov/WebLink/DocView.aspx?id=14390974&dbid=0&repo=OCC&searchid=9aeb86e3-63db-43fe-8c38-b61f0bc1df34",
        "Sec-Ch-Ua": '"Chromium";v="121", "Not A(Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
      data: {
        repoName: "OCC",
        entryId,
      },
    });

    return response.data;
  } catch (error) {
    console.error(error);
  }
};

async function generatePDF10(id, PageRange) {
  const response = await axios({
    url: `https://public.occ.ok.gov/WebLink/GeneratePDF10.aspx?key=${id}&PageRange=1%20-%20${PageRange}&Watermark=0&repo=OCC`,
    method: "post",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      cookie:
        "BIGipServer~ONE-ARMED-PUBLIC~occ_public.occ.ok.gov.app~occ_public.occ.ok.gov_pool=rd5o00000000000000000000ffffac1ee676o443; AcceptsCookies=1; WebLinkSession=dppbvpubu5vsietlop402vne; MachineTag=31554aa4-5706-4ae3-b963-fc344ead6d82; lastSessionAccess=638436424065183820",
      "sec-ch-ua": '"Chromium";v="121", "Not A(Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-lf-suppress-login-redirect": "1",
    },
    // data: requestPayload,
    referrer:
      "https://public.occ.ok.gov/WebLink/CustomSearch.aspx?SearchName=ImagedCaseDocumentsfiledafter3212022&dbid=0&repo=OCC&cr=1",
    referrerPolicy: "strict-origin-when-cross-origin",
    withCredentials: true,
  });
  return response.data.split(`\n<html lang="en-US">`)[0];
}

const downloadPdf = async (url, destination) => {
  const response = await axios({
    url,
    method: "GET",
    headers: {
      cookie:
        "BIGipServer~ONE-ARMED-PUBLIC~occ_public.occ.ok.gov.app~occ_public.occ.ok.gov_pool=rd5o00000000000000000000ffffac1ee676o443; WebLinkSession=dppbvpubu5vsietlop402vne; lastSessionAccess=638436460666637293",
    },
    responseType: "stream",
  });

  const writer = fs.createWriteStream(destination);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

async function processInParallel(startDate, endDate, hitCount, searchUuid) {
  const limit = 20;
  const iterations = Math.ceil(hitCount / limit);

  let promises = [];

  for (let i = 0; i < iterations; i++) {
    const start = i * limit;
    const end = start + limit;
    let getNewListing = i == 0 ? true : false;

    console.log(startDate, endDate, start, end, getNewListing, searchUuid);

    // Pushing the promise returned by 'search' into 'promises' array
    promises.push(search(startDate, endDate, start, end, getNewListing));
  }

  // using Promise.all to wait for all promises to resolve
  let results = await Promise.all(promises);

  // Now 'results' is an array that contains the response of each 'search' call
  // and you can process it as required.

  let processedResults = results.map((result) => {
    return result.data.results;
  });

  return processedResults;
}

// batch processing
const processItems = async (items) => {
  await Promise.all(items.map(processItem));
};

// chunk array for batch processing
const chunkArray = (arr, chunkSize) => {
  var R = [];
  for (var i = 0, len = arr.length; i < len; i += chunkSize) {
    R.push(arr.slice(i, i + chunkSize));
  }
  return R;
};

// Function to extract metadata and transform it into a format suitable for csv-writer
function transformData(jsonArray) {
  return jsonArray.map((item) => {
    const tempObj = {};
    item.metadata.forEach((meta) => {
      // Assuming you want the first value of the values array for each metadata
      if (meta.values && meta.values.length > 0) {
        tempObj[meta.name] = meta.values[0];
      }
    });
    return tempObj;
  });
}

(async () => {
  //  dates scope for search
  const startDate = formatDate(yesterday, "/");
  const endDate = formatDate(today, "/");
  console.log(startDate, endDate, 0, 10);

  const searchResponseData = await search(
    startDate,
    endDate,
    0,
    10, // how many items will be downloaded per request
    true
  );

  const hitCount = searchResponseData.data.hitCount;
  console.log(hitCount);
  console.log(searchResponseData.data.results.length);
  console.log(searchResponseData.data.searchUUID);
  const searchUuid = searchResponseData.data.searchUUID;

  let results = await processInParallel(
    startDate,
    endDate,
    hitCount,
    searchUuid
  );

  console.log(results);

  function flattenArray(array) {
    return [].concat(...array);
  }

  results = flattenArray(results);
  const transformedData = transformData(results);

  const csvWriter = createCsvWriter({
    path: `occ_case_${formatDate(yesterday, "-")}_${formatDate(
      today,
      "-"
    )}.csv`,
    header:
      transformedData.length > 0
        ? Object.keys(transformedData[0]).map((key) => ({
            id: key,
            title: key,
          }))
        : [],
  });

  // Write the data to a CSV file
  csvWriter
    .writeRecords(transformedData)
    .then(() => console.log("Data was written successfully to output.csv"))
    .catch((err) => console.error("Error writing CSV:", err));

  // fs.writeFile("list.json", JSON.stringify(results, null, 2), (err) => {
  //   if (err) {
  //     console.error("Error writing file", err);
  //   } else {
  //     console.log("Successfully wrote to airbnb.json");
  //   }
  // });

  const chunkedItems = chunkArray(results, 10); // Change this number to how many items you want to process simultaneously

  const processAllItems = async () => {
    for (const chunk of chunkedItems) {
      await processItems(chunk); // Process each chunk sequentially.
    }
    console.log("All downloads completed.");
  };

  // Start processing all items
  processAllItems();
})();

const processItem = async (item) => {
  /* same function as above */
  const entryId = item.entryId;
  const pageCount = (await getBasicDocumentInfo(entryId)).data.pageCount;
  console.log(pageCount);
  const browserUid = await generatePDF10(entryId, pageCount);

  // wait for 10 seconds
  await delay(10000);

  console.log(browserUid);

  await downloadPdf(
    `https://public.occ.ok.gov/WebLink/PDF10/${browserUid}/${entryId}`,
    `1/occ_${item.metadata[1].values[0]}_${entryId}.pdf`
  );
  console.log("Download completed.");
};
