const getBookUrls = require('./getHistoricalBookUrls');
const saveDocument = require('./saveHistoricalDocument');

(async () => {
  await getBookUrls();
  await saveDocument();
  console.log("OK")
})();