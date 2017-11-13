var fs = require('fs');
var db = require('./db');
var agent = require('superagent');
require('superagent-proxy')(agent);
require('q-superagent')(agent);
var config = JSON.parse(fs.readFileSync('./config/config.json', 'utf8'));

var loader = (function(){

  function _uploadAll(){
    var fileList = fs.readdirSync(config.uploadFolder + '/docs');
    //console.log('fileList', fileList);
    for(var i = 0; i < fileList.length; i++){
      if(! /^\..*/.test(fileList[i])) {
        var fileId = fileList[i].replace(' - Case.pdf', '');
        _getMetadata(fileId).then(_upload);
      }
    }
  }

  function _callback(resp){
    console.log('End: ', resp);
  }

  function _getMetadata(fileId){
    console.log('File ID: ', fileId);
    return agent
      .get(config.google.fileAPI.replace(':fileId', fileId))
      .set({'Authorization': 'Bearer ' + config.google.auth.token})
      .proxy(config.proxy);
  }

  function _upload(res){
    var metadata = res.body;
    var fileId = metadata.id;
    var filePath = config.uploadFolder + '/docs/' + fileId + ' - Case.pdf';
    console.log('File Path: ' + filePath);
    agent
      .post(config.cms.uploadAPI)
      .field('caseName', metadata.title)
      .field('link', metadata.selfLink)
      .attach('presentationFile', filePath)
      .attach('documentFile', filePath)
      .set('Cookie', config.cms.cookie)
      .catch(function(err){
        console.error('Error', err);
      })
      //.end(_callback);
  }

  return {
    uploadAll: _uploadAll
  }

})();

module.exports = loader;