var fs = require('fs');
var Q = require('q');
var db = require('./db');
var agent = require('superagent');
var binaryParser = require('superagent-binary-parser');
var parse = require('csv-parse');
var fs = require('fs');
require('superagent-proxy')(agent);
require('q-superagent')(agent);
var config = JSON.parse(fs.readFileSync('../config/config.json', 'utf8'));

var extracter = (function () {

  let documents;
  let presentations;
  const files = [];
  const tags = [];

  const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

  function _getDocs() {
    console.log("Downloading Documents metadata");

    return agent
      .get(config.google.listAPI.replace(':folderId', config.google.folderId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
      .then(function (response) {
        documents = response.body;
        console.log(`Documents metadata downloaded: ${documents.items.length}`);
      });
  }

  function _getPresentations() {
    console.log("Downloading Presentations metadata");
    return agent
      .get(config.google.presentationAPI.replace(':folderId', config.google.folderId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
      .then(function (response) {
        presentations = response.body;
        console.log(`Presentations metadata downloaded: ${presentations.items.length}`);
      });
  }

  async function _downloadAllFiles(itemsToDownload) {

    const filePromises = [];

    for (var i = 0; i < itemsToDownload.length; i++) {
      var download = _getMetadata(itemsToDownload[i].id);
      filePromises.push(download);
    }

    return Q.all(filePromises).then(responses => responses.forEach(x => files.push(x.body)));
  }

  function _getMetadata(fileId) {
    return agent
      .get(config.google.fileAPI.replace(':fileId', fileId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token });
  }

  async function _downloadManager() {
    const items = documents.items.concat(presentations.items);

    const max = items.length;
    let bottomLimit = 0;
    let topLimit = 10;
    const step = 10;

    console.log(`Downloading files, count: ${max}`);

    while ((topLimit - max) < step) {

      console.log(`Downloading files, from: ${bottomLimit} to: ${topLimit < max ? topLimit : max}`);

      await _downloadAllFiles(items.slice(bottomLimit, topLimit));

      console.log(`Downloaded files, from: ${bottomLimit} to: ${topLimit < max ? topLimit : max}`);

      await snooze(2000);
      bottomLimit += step;
      topLimit += step;
    }

    console.log("Downloaded all files");

    await _uploadFiles(files);
  }

  async function _uploadFiles(pFiles) {
    console.log("Starting uploading...");

    const _documents = [];
    const _presentations = [];

    for (let i = 0; i < pFiles.length; i++) {
      const _file = pFiles[i];
      switch (_file.mimeType) {
        case "application/vnd.google-apps.document": {
          _documents.push(_file);
          break;
        }
        case "application/vnd.google-apps.presentation": {
          _presentations.push(_file);
        }
      }
    }

    console.log(`Documents: ${_documents.length}, Presentations: ${_presentations.length}`);
    if (_documents.length !== _presentations.length)
      console.warn(`The quantity of the Documents is not equal to Presentations`);

    var fullCases = [];

    for (let i = 0; i < _documents.length; i++) {
      const _document = _documents[i];
      const _presentation = _presentations.find(x => x.title === _document.title);
      const _tags = tags.find(x => x.caseName === _document.title);

      if (!_presentation) {
        console.error("ERROR: could not found presentation for document: " + _document.title);
      }

      if (!_tags) {
        console.error("ERROR: could not found tags for document: " + _document.title);
      }

      fullCases.push({ document: _document, presentation: _presentation, tags: _tags });
    }

    for (let i = 0; i < fullCases.length; i++) {

      const _document = fullCases[i].document;
      const _presentation = fullCases[i].presentation;
      const _tags = fullCases[i].tags;

      const _data = {
        caseName: _document.title,
        link: _document.alternateLink,
        undisclosed: false,
        techTags: _tags.tech,
        businessTags: _tags.business,
        studioTags: _tags.studio,
        document: {
          drive: _document,
          name: _document.title + '.pdf'
        },
        deck: {
          drive: _presentation,
          name: _presentation.title + '.pdf'
        }
      };

      try {

        console.log(`[${i}] - Uploading... ${_document.title}`);

        await agent
          .post(config.cms.uploadAPI)
          .send(_data)
          .set('Cookie', config.cms.cookie)
          .proxy(config.proxy)
          .timeout(600000);

        console.log(`[${i}] - Uploaded... ${_document.title}`);

        await snooze(5000);
      }
      catch (e) {
        console.error(`[${i}] - Error on upload {document: ${_document.title}, presentation: ${_presentation.title}}`);
        console.log(e);
      }
    }

    console.log("Upload finished!");
  }

  function _importTags() {
    console.log("Importing tags");

    return new Promise((resolve, reject) => {
      try {
        var parser = parse({ delimiter: ',' }, function (err, data) {
          if (err) {
            console.error("Error on tags import", e);
            reject();
          }

          // the index 0 are the titles of the columns
          for (let i = 1; i < data.length; i++) {
            const current = data[i];
            const caseTags = {
              caseName: current[0],
              tech: current[1].split(','),
              studio: current[2].split(','),
              business: current[3].split(',')
            }

            tags.push(caseTags);
          }

          console.log("Tags import finished");
          resolve(tags);
        });

        fs.createReadStream('../config/tags.csv').pipe(parser);
      } catch (e) {
        console.error("Error on tags import", e);
        reject();
      }
    });
  }

  return {
    importTags: _importTags,
    downloadAllDocs: _getDocs,
    downloadAllPresentations: _getPresentations,
    uploadAllFiles: _downloadManager
  };

})();

module.exports = extracter;