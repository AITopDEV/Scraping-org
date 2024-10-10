@echo off
echo getting Historical Book Urls...
node getHistoricalBookUrls.js
echo finished getting book urls

echo saving documents
node saveHistoricalDocument.js
echo saving documents completed.

echo Both scripts executed successfully.
pause