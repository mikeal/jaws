var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.condition('auth', 401, function (req, resp, cb) {
  if (req.url === '/auth/no') cb(new Error('not authorized'))
  else {
    req.user = req.url
    cb(null)
  }
})

app.route('/auth/*', function (req, resp) {
  resp.statusCode = 200
  resp.end(req.text)
})
.condition(401, function (req, resp, cb) {
  req.on('condition.auth', function () {
    req.text = req.user
    cb(null)
  })
})
.must('auth')
;


app.httpServer.listen(8080, function () {
  var testsLength = 2
    , i = 0
    ;
  function done () {
    i += 1
    if (i === testsLength) app.httpServer.close()
  }
  
  var r = request.post('http://localhost:8080/auth/no', function (e, resp, body) {
    if (e) throw e
    assert.equal(401, resp.statusCode)
    assert.notEqual('ok', body)
    done()
  })
  
  var r = request.post('http://localhost:8080/auth/yes', function (e, resp, body) {
    if (e) throw e
    assert.equal(200, resp.statusCode)
    assert.equal('/auth/yes', body)
    done()
  })
  
})