var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

app.route('/test1', function (req, resp) {
  resp.json({test:1})
})
app.route('/test2', function (req, resp) {
  resp.json(function () {})
})

app.route('/test400', function (req, resp) {
  resp.json({test:1}, 400)
})

app.httpServer.listen(8080, function () {
  request.get('http://localhost:8080/test1', {json:true}, function (e, resp, body) {
    assert.equal(200, resp.statusCode)
    assert.equal(resp.headers['content-type'], 'application/json')
    assert.deepEqual(body, {test:1})
    
    request.get('http://localhost:8080/test2', function (e, resp, body) {
      assert.equal(500, resp.statusCode)
      
      request.get('http://localhost:8080/test400', {json:true}, function (e, resp, body) {
        assert.equal(400, resp.statusCode)
        assert.equal(resp.headers['content-type'], 'application/json')
        assert.deepEqual(body, {test:1})
        
        app.httpServer.close()
      })
    })
  })
})