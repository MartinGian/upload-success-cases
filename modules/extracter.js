var fs = require('fs');
var Q = require('q');
var db = require('./db');
var agent = require('superagent');
var binaryParser = require('superagent-binary-parser');
require('superagent-proxy')(agent);
require('q-superagent')(agent);
var config = JSON.parse(fs.readFileSync('../config/config.json', 'utf8'));

var extracter = (function () {

  var documents;
  var presentations;
  var files = [];
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
      const _presentation = _presentations.find(x => x.title == _document.title);
      if (!_presentation) {
        console.error("ERROR: could not found presentation for document: " + _document.title);
        return;
      }

      fullCases.push({ document: _document, presentation: _presentation });
    }

    for (let i = 0; i < fullCases.length; i++) {
      try {

        const _document = fullCases[i].document;
        const _presentation = fullCases[i].presentation;

        const _data = {
          caseName: _document.title,
          link: _document.alternateLink,
          undisclosed: false,
          document: {
            drive: _document,
            name: _document.title + '.pdf'
          },
          deck: {
            drive: _presentation,
            name: _presentation.title + '.pdf'
          }
        };

        console.log(`[${i}] - Uploading... ${_document.title}`);

        await agent
          .post(config.cms.uploadAPI)
          .send(_data)
          .set('Cookie', config.cms.cookie);

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


  function _getMetadata(fileId) {
    return agent
      .get(config.google.fileAPI.replace(':fileId', fileId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
    // .proxy(config.proxy);
  }

  function _downloadFile(res) {
    //console.log('_downloadFile', res.body);
    var metadata = res.body;
    var fileId = metadata.id;

    return agent
      .get(config.google.exportAPI.replace(':fileId', fileId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
      // .proxy(config.proxy)
      .parse(binaryParser)
      .buffer()
      .then(function (res) {
        return {
          fileBytes: res.body,
          fileMetadata: metadata
        }
      });
  }

  function _saveFile(data) {
    var deferred = Q.defer();
    var isDocument = (data.fileMetadata.mimeType.indexOf('doc')) > 0;
    var suffix = isDocument ? ' - Case' : ' - Pitch';
    var folder = isDocument ? 'docs' : 'presentations';
    //console.log('data?: ', data);
    //console.log('res?: ', !!res);
    fs.writeFile(config.downloadFolder + '/' + folder + '/' + data.fileMetadata.id + suffix + '.pdf', data.fileBytes, function (err) {
      if (err) {
        deferred.reject();
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  return {
    downloadAllDocs: _getDocs,
    downloadAllPresentations: _getPresentations,
    uploadAllFiles: _downloadManager
  };

})();

module.exports = extracter;