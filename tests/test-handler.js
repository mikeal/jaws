var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

app.route('/test', function (req, resp) {
  resp.statusCode = 200
  resp.setHeader('testheader', '1234')
  resp.end('asdf')
})

assert.equal(0, Object.keys(app.lru.dump()).length)
app.httpServer.listen(8080, function () {
  assert.equal(0, Object.keys(app.lru.dump()).length)
  request.get('http://localhost:8080/test', function (e, resp, body) {
    assert.equal(1, Object.keys(app.lru.dump()).length)
    assert.equal(200, resp.statusCode)
    assert.equal(resp.headers.testheader, '1234')
    assert.equal(body, 'asdf')
    
    request.get('http://localhost:8080/test', function (e, resp, body) {
      assert.equal(1, Object.keys(app.lru.dump()).length)
      assert.equal(200, resp.statusCode)
      assert.equal(resp.headers.testheader, '1234')
      assert.equal(body, 'asdf')

      app.httpServer.close()
    })
  })
})