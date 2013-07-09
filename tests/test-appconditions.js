var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app
.condition('auth', 401, function (req, resp, cb) {
  cb(new Error('not authorized'))
})
app.condition('err', function (req, resp, cb) {
  if (req.url === '/err') cb(new Error('500 error'))
  else cb(null)
})

app.route('/auth', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.must('auth')

app.route('/err', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.must('err')

app.route('/no', function (req, resp) {
  resp.statusCode = 200
  resp.end('ok')
})
.must('thisdoesntexit')

app.httpServer.listen(8080, function () {
  var testsLength = 3
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
    assert.equal(body, 'Route requires condition that does not exist.')
    done()
  })

})