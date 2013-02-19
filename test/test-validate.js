var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.route('/yes', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.validate(401, function (req, resp, cb) {
  cb(null, false)
})

app.route('/no', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.validate(401, function (req, resp, cb) {
  cb(new Error('unauthed'))
})

app.route('/no500', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.validate(function (req, resp, cb) {
  cb(new Error('unauthed'))
})

app.httpServer.listen(8080, function () {
  request('http://localhost:8080/yes', function (e, resp, b) {
    if (e) throw e
    assert.equal(resp.statusCode, 200)    
    
    request('http://localhost:8080/no', function (e, resp, body) {
      if (e) throw e
      assert.equal(resp.statusCode, 401)
      assert.equal(body, 'unauthed')
      
      request('http://localhost:8080/no500', function (e, resp, body) {
        if (e) throw e
        assert.equal(resp.statusCode, 500)
        assert.equal(body, 'unauthed')
        app.httpServer.close()
      })
    })
  })
})
