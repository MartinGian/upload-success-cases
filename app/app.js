var extracter = require('../modules/extracter');

console.log("Starting..");

extracter
    .importTags()
    .then(extracter.downloadAllDocs)
    .then(extracter.downloadAllPresentations)
    .then(extracter.downloadAllPresentations)
    .then(extracter.uploadAllFiles);