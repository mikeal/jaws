var jaws = require('../index')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.route('/error', function (req, resp) {
  process.nextTick(function () {
    resp.error(new Error('Something bad'))
  })
})
;

app.httpServer.listen(8080, function () {
  request('http://localhost:8080/error', function (e, resp, b) {
    if (e) throw e
    assert.equal(resp.statusCode, 500)
    assert.equal(app.lru.has('/error'), false)

    app.httpServer.close()
  })
})
