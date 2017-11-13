var loki = require('lokijs');

var db = (function(){

  var db = new loki('sc.db'); 
  var docs = db.getCollection('docs');
  if(!docs){
    docs = db.addCollection('docs');;
  }

  function _insert(doc){
    docs.insert(doc);
  }

  function _getOne(doc){
    docs.findOne(doc);
  }

  function _getById(id){
    return _getOne({ id: id});
  }

  return {
    insert: _insert,
    getOne: _getOne,
    getById: _getById
  };
  
}());

module.exports = db;