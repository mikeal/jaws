var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

app.route('/test1', function (req, resp) {
  resp.html('<html></html>')
})
app.route('/test400', function (req, resp) {
  resp.html('<html></html>', 400)
})

app.httpServer.listen(8080, function () {
  request.get('http://localhost:8080/test1', {json:true}, function (e, resp, body) {
    assert.equal(200, resp.statusCode)
    assert.equal(resp.headers['content-type'], 'text/html')
    assert.equal(body, '<html></html>')

    request.get('http://localhost:8080/test400', {json:true}, function (e, resp, body) {
      assert.equal(400, resp.statusCode)
      assert.equal(resp.headers['content-type'], 'text/html')
      assert.equal(body, '<html></html>')

      app.httpServer.close()
    })
  })
})