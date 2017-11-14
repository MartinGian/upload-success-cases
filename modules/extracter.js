var fs = require('fs');
var Q = require('q');
var db = require('./db');
var agent = require('superagent');
var binaryParser = require('superagent-binary-parser');
require('superagent-proxy')(agent);
require('q-superagent')(agent);
var config = JSON.parse(fs.readFileSync('./config/config.json', 'utf8'));

var extracter = (function () {

  var documents;
  var presentations;

  function _getDocs() {
    return agent
      .get(config.google.listAPI.replace(':folderId', config.google.folderId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
      .then(function (response) {
        documents = response.body;
      });
  }

  function _getPresentations() {
    return agent
      .get(config.google.presentationAPI.replace(':folderId', config.google.folderId))
      .set({ 'Authorization': 'Bearer ' + config.google.auth.token })
      .then(function (response) {
        presentations = response.body;
      });
  }

  function _downloadAllFiles() {
    var items = documents.items.concat(presentations.items);
    var filePromises = [];
    for (var i = 0; i < items.length; i++) {
      var download = _getMetadata(items[i].id);
      filePromises.push(download);
    }

    return Q.all(filePromises).then(_uploadFiles);
  }

  function _uploadFiles(files) {
    const documents = [];
    const presentations = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i].body;

      switch (file.mimeType) {
        case "application/vnd.google-apps.document": {
          documents.push(file);
          break;
        }
        case "application/vnd.google-apps.presentation": {
          presentations.push(file);
        }
      }
    }

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      const presentation = presentations.find(x => x.title == document.title);

      const data = {
        caseName: document.title,
        link: document.alternateLink,
        undisclosed: false,
        document: {
          drive: document,
          name: document.title + '.pdf'
        },
        deck: {
          drive: presentation,
          name: presentation.title + '.pdf'
        }
      };

      agent
        .post(config.cms.uploadAPI)
        .send(data)
        .set('Cookie', config.cms.cookie)
        .catch(function (err) {
          console.error('Error', err);
        })
    }
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
    uploadAllFiles: _downloadAllFiles
  };

})();

module.exports = extracter;