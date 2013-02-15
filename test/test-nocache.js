var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

var count = 0
app.route('/test', function (req, resp) {
  resp.statusCode = 200
  resp.setHeader('testheader', '1234')
  resp.end(count.toString())
  count += 1
})
.nocache()

assert.equal(0, Object.keys(app.lru.dump()).length)
app.httpServer.listen(8080, function () {
  assert.equal(0, Object.keys(app.lru.dump()).length)
  request.get('http://localhost:8080/test', function (e, resp, body) {
    assert.equal(0, Object.keys(app.lru.dump()).length)
    assert.equal(200, resp.statusCode)
    assert.equal(resp.headers.testheader, '1234')
    assert.equal(body, '0')
    
    request.get('http://localhost:8080/test', function (e, resp, body) {
      assert.equal(0, Object.keys(app.lru.dump()).length)
      assert.equal(200, resp.statusCode)
      assert.equal(resp.headers.testheader, '1234')
      assert.equal(body, '1')

      app.httpServer.close()
    })
  })
})