var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app
.condition('authorized', 401, function (req, resp, cb) {
  if (req.url === '/auth') cb(new Error('not authorized'))
  else cb(null)
})
.condition('err', function (req, resp, cb) {
  if (req.url === '/err') cb(new Error('500 error'))
  else cb(null)
})
.condition(function (req, resp, cb) {
  if (req.url === '/no') cb(new Error('no options'))
  else cb(null)
})
.condition(function (req, resp, cb) {
  if (req.url === '/future') {
    setTimeout(function () {
      req.blah = 'test'
      cb(null)
    }, 5)
  } else cb(null)
})

app.route('/auth', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})

app.route('/err', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})

app.route('/no', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})

app.route('/future', function (req, resp) {
  resp.statusCode = 200
  resp.end(req.blah)
})



app.httpServer.listen(8080, function () {
  var testsLength = 4
    , i = 0
    ;
  function done () {
    i += 1
    if (i === testsLength) app.httpServer.close()
  }
  
  var r = request.post('http://localhost:8080/auth', function (e, resp, body) {
    if (e) throw e
    assert.equal(401, resp.statusCode)
    assert.notEqual('ok', body)
    done()
  })
  
  var r = request.post('http://localhost:8080/err', function (e, resp, body) {
    if (e) throw e
    assert.equal(500, resp.statusCode)
    assert.notEqual('ok', body)
    done()
  })
  
  var r = request.post('http://localhost:8080/no', function (e, resp, body) {
    if (e) throw e
    assert.equal(500, resp.statusCode)
    assert.notEqual('ok', body)
    done()
  })
  
  var r = request.post('http://localhost:8080/future', function (e, resp, body) {
    if (e) throw e
    assert.equal(200, resp.statusCode)
    assert.equal('test', body)
    done()
  })
})