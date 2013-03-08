var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.route('/auth', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.condition('auth', 401, function (req, resp, cb) {
  cb(new Error('nope'))
})
.must('auth')

app.route('/authed', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.condition('auth', 401, function (req, resp, cb) {
  cb(null, true)
})
.must('auth')

app.httpServer.listen(8080, function () {
  request('http://localhost:8080/auth', function (e, resp, b) {
    if (e) throw e
    assert.equal(resp.statusCode, 401)
    
    request('http://localhost:8080/authed', function (e, resp) {
      if (e) throw e
      assert.equal(resp.statusCode, 200)
      app.httpServer.close()
    })
  })
})
