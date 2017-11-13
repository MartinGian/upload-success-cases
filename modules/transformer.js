var request = require('request');
var hummus = require('hummus');
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));

var transformer = (function(){

  function _embedWaterMarks(){
    var downloadedFiles = fs.readdirSync(config.downloadFolder);
    for(var i = 0; i < 5 /* downloadedFiles.length */; i++) {
      _embedWatermark(downloadedFiles[i]);
    }
  }

  function _embedWatermark(filename){  
    var defer = Q.defer();  
    var pdfPath = config.downloadFolder + '/' + filename;
    var pdfReader = hummus.createReader(pdfPath);
    var pagesCount = pdfReader.getPagesCount();
    var pdfWriter = hummus.createWriterToModify(pdfPath, {
      modifiedFilePath: config.outputFolder + '/' + filename
    });
    _setDocumentInfo(pdfWriter);
    
    for(var i = 0; i < pagesCount; i++){
      var pageModifier = new hummus.PDFPageModifier(pdfWriter, i);
      var context = pageModifier.startContext().getContext();
      //_writeText(pdfWriter, context);
      _drawImage(context);
      pageModifier.endContext().writePage();
    }

    pdfWriter.end();
    return defer.promise().resolve();
  }

  function _setDocumentInfo(pdfWriter){
    var dic = pdfWriter.getDocumentContext().getInfoDictionary();
    dic.author = 'Globant';
    dic.creator = 'Globant';
    dic.subject = 'Globant';
  }

  function _writeText(pdfWriter, context){
    context.writeText( 'DRAFT', 150, 300,
      { 
        font: pdfWriter.getFontForFile('/Library/Fonts/Arial.ttf'), 
        size: 50, 
        colorspace:'gray', 
        color: 0x00 
      }
    );
  }

  function _drawImage(context){
    context.drawImage(150, 350, './images/undisclosed-stamp.jpg');
  }

  return {
    embedWaterMarks: _embedWaterMarks
  };

})();

module.exports = transformer;