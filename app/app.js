var extracter = require('../modules/extracter');
//var transformer = require('../modules/transformer');
var loader = require('../modules/loader');

extracter.downloadAllDocs()
    .then(extracter.downloadAllPresentations)
    .then(extracter.downloadAllPresentations)
    .then(extracter.uploadAllFiles);
    // .then(loader.uploadAll);

//.invoke(transformer.embedWaterMarks)
//