@echo off
echo getting Historical Book Urls...
node getUpdatedBookUrls.js
echo finished getting book urls

echo saving documents
node saveUpdatedDocument.js
echo saving documents completed.

echo Both scripts executed successfully.
pause