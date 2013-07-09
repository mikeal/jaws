var jaws = require('../index')
  , zlib = require('zlib')
  , path = require('path')
  , fs = require('fs')
  , assert = require('assert')
  , request = require('request')
  ;

var app = jaws()

app.route('/test').file(path.join(__dirname, '..', 'node_modules', 'mapleTree', 'treeRouter.js'))

var buff = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'mapleTree', 'treeRouter.js'))

app.httpServer.listen(8080, function () {
  request.get('http://localhost:8080/test', function (e, resp, body) {
    if (e) throw e
    if (resp.statusCode !== 200) throw new Error('status code is not 200. '+resp.statusCode)
    
    assert.equal(resp.headers['content-type'], 'application/javascript')
    assert.deepEqual(new Buffer(body), buff)
    assert.equal(1, Object.keys(app.lru.dump()).length)
    
    var r = request.get('http://localhost:8080/test', {headers:{'accept-encoding':'gzip, deflate'}})
    r.on('response', function (resp) {
      if (resp.statusCode !== 200) throw new Error('status code is not 200. '+resp.statusCode)
            
      assert.equal(resp.headers['content-type'], 'application/javascript')
      assert.equal(resp.headers['content-encoding'], 'gzip')      
      
    })
    var chunks = []
    r.on('data', function (chunk) {
      chunks.push(chunk)
    })
    r.on('end', function () {
      var buffer = new Buffer(chunks.reduce(function (i, c) { return (i.length || i) + c.length }))
      var i = 0
      chunks.forEach(function (chunk) {chunk.copy(buffer, i, 0, chunk.length); i += chunk.length})
      zlib.gunzip(buffer, function (e, data) {
        if (e) throw e
        assert.deepEqual(data, buff)
      })
      app.httpServer.close()
    })
    r.on('error', function (e) {throw e})
  })
})