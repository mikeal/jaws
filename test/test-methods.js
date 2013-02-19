var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.route('/meth', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.methods('post')
;

app.httpServer.listen(8080, function () {
  request('http://localhost:8080/meth', function (e, resp, b) {
    if (e) throw e
    assert.equal(resp.statusCode, 405)
    
    request.post('http://localhost:8080/meth', function (e, resp) {
      if (e) throw e
      assert.equal(resp.statusCode, 200)
      app.httpServer.close()
    })
  })
})
