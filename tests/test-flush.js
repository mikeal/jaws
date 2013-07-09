var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

app.route('/test/:stuff', function (req, resp) {
  resp.statusCode = 200
  resp.setHeader('testheader', '1234')
  resp.end('asdf')
})

function assertCache (size) {
  assert.equal(size, Object.keys(app.lru.dump()).length)
}

assertCache(0)
app.httpServer.listen(8080, function () {
  assertCache(0)
  request.get('http://localhost:8080/test/test1', function (e, resp, body) {
    assertCache(1)
    
    request.get('http://localhost:8080/test/test2', function (e, resp, body) {
      assertCache(2)
      
      app.flush('/test/test1')
      assertCache(1)
      
      app.flush('/test/*')
      assertCache(0)

      app.httpServer.close()
    })
  })
})