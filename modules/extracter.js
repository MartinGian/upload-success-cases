var fs = require('fs');
var Q = require('q');
var db = require('./db');
var agent = require('superagent');
var binaryParser = require('superagent-binary-parser');
require('superagent-proxy')(agent);
require('q-superagent')(agent);
var config = JSON.parse(fs.readFileSync('./config/config.json', 'utf8'));

var extracter = (function(){

  function _getDocs(){
    return agent
    .get(config.google.listAPI.replace(':folderId', config.google.folderId))
    .set({'Authorization': 'Bearer ' + config.google.auth.token})
    .proxy(config.proxy)    
    .then(_downloadAllFiles);
  }

  function _getPresentations(){
    return agent
    .get(config.google.presentationAPI.replace(':folderId', config.google.folderId))
    .set({'Authorization': 'Bearer ' + config.google.auth.token})
    .proxy(config.proxy)    
    .then(_downloadAllFiles);
  }

  function _downloadAllFiles(res){
    var filePromises = [];
    var data = res.body;
    for(var i = 0; i < 3 /*data.items.length*/; i++){
      //console.log('Item: ', data.items[i]);
      var download = _getMetadata(data.items[i].id)
          .then(_downloadFile)
          .then(_saveFile);
      filePromises.push(download);
    }
    return Q.all(filePromises);
  }

  function _getMetadata(fileId){
    return agent
      .get(config.google.fileAPI.replace(':fileId', fileId))
      .set({'Authorization': 'Bearer ' + config.google.auth.token})
      .proxy(config.proxy);
  }

  function _downloadFile(res) {
    //console.log('_downloadFile', res.body);
    var metadata = res.body;
    var fileId = metadata.id;

    return agent
      .get(config.google.exportAPI.replace(':fileId', fileId))
      .set({'Authorization': 'Bearer ' + config.google.auth.token})
      .proxy(config.proxy)
      .parse(binaryParser)
      .buffer()
      .then(function(res){
        return {
          fileBytes: res.body,
          fileMetadata: metadata
        }
      });   
    }

  function _saveFile(data){
    var deferred = Q.defer();
    var isDocument = (data.fileMetadata.mimeType.indexOf('doc')) > 0;
    var suffix = isDocument ? ' - Case' : ' - Pitch';
    var folder = isDocument ? 'docs' : 'presentations';
    //console.log('data?: ', data);
    //console.log('res?: ', !!res);
    fs.writeFile(config.downloadFolder + '/' + folder + '/' + data.fileMetadata.id + suffix + '.pdf', data.fileBytes, function(err){
      if (err){
        deferred.reject();
      }else{
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  return {
    downloadAllDocs: _getDocs,
    downloadAllPresentations: _getPresentations,
  };

})();

module.exports = extracter;