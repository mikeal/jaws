var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()
var i = 0

app.route('/flush', function (req, resp) {
  resp.statusCode = 201
  resp.end(i.toString())
  i += 1
})

app.httpServer.listen(8080, function () {
  var r = request.post('http://localhost:8080/flush', {json:{test:'asdf'}}, function (e, resp, body) {
    if (e) throw e
    assert.equal(201, resp.statusCode)
    assert.equal('0', body)
    var r = request.post('http://localhost:8080/flush', {json:{test:'asdf'}}, function (e, resp, body) {
      if (e) throw e
      assert.equal(201, resp.statusCode)
      assert.equal('1', body)
      process.exit(0)
    })
  })
})