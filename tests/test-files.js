var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  ;

var app = jaws()

app.route('/static/*').files(path.join(__dirname, '..', 'node_modules'))

app.httpServer.listen(8080, function () {
  assert.equal(0, Object.keys(app.lru.dump()).length)
  request.get('http://localhost:8080/static/mapleTree/treeRouter.js', function (e, resp, body) {
    if (e) throw e
    if (resp.statusCode !== 200) throw new Error('status code is not 200. '+resp.statusCode)

    var buff = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'mapleTree', 'treeRouter.js'))
    assert.equal(resp.headers['content-type'], 'application/javascript')
    assert.deepEqual(new Buffer(body), buff)
    assert.equal(1, Object.keys(app.lru.dump()).length)

    request.get('http://localhost:8080/static/mapleTree/treeRouter.js', function (e, resp, body) {
      if (e) throw e
      if (resp.statusCode !== 200) throw new Error('status code is not 200. '+resp.statusCode)

      assert.equal(1, Object.keys(app.lru.dump()).length)

      assert.equal(resp.headers['content-type'], 'application/javascript')
      assert.equal(resp.headers['content-length'], buff.length)
      assert.deepEqual(new Buffer(body), buff)

      app.httpServer.close()
    })
  })
})