var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

var count = 0
app.route('/json', function (req, resp) {
  req.body(function (e, b) {
    if (e) throw e
    assert.ok(b.test && b.test === true)
    resp.statusCode = 200
    resp.end()
  })
})

app.route('/url', function (req, resp) {
  req.body(function (e, b) {
    if (e) throw e
    assert.ok(b.test && b.test === 'asdf')
    resp.statusCode = 200
    resp.end()
  })
})

app.route('/invalid', function (req, resp) {
  req.body(function (e, b) {
    if (!e) throw new Error('should have received error.')
    resp.statusCode = 200
    resp.end()
  })
})

app.httpServer.listen(8080, function () {
  request.post('http://localhost:8080/json', {json:{test:true}}, function (e, resp, body) {
    assert.equal(200, resp.statusCode)
    
    request.post('http://localhost:8080/url', {form:{test:'asdf'}}, function (e, resp, body) {
      assert.equal(200, resp.statusCode)

      var r = request.post('http://localhost:8080/invalid', {json:true}, function (e, resp, body) {
        assert.equal(200, resp.statusCode)
        app.httpServer.close()
      })
      r.write('{ajsdfajsdfoiasjdfioj}')
      r.end()
    })
  })
})