var jaws = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  , f = path.join(__dirname, '..', 'node_modules', 'mapleTree', 'treeRouter.js')
  ;

var app = jaws()
  , testBuffer = Buffer.concat([fs.readFileSync(f),fs.readFileSync(f),fs.readFileSync(f)])
  ;

app.route('/app', function (req, resp) {
  resp.statusCode = 200
  resp.write(fs.readFileSync(f))
  setImmediate(function () {
    resp.write(fs.readFileSync(f))
    setTimeout(function () {
      resp.write(fs.readFileSync(f))
      resp.end()
    }, 100)
  })
})

app.httpServer.listen(8080, function () {
  assert.equal(0, Object.keys(app.lru.dump()).length)

  var l = null
    , passes = 0
    ;

  function get () {
    request.get('http://localhost:8080/app', {encoding:null, timeout:5*1000}, function (e, resp, body) {
      if (e) throw e
      if (resp.statusCode !== 200) throw new Error('status code is not 200. '+resp.statusCode)

      assert.equal(body.length, testBuffer.length)
      assert.deepEqual(body, testBuffer)
      passes += 1
      if (passes === 5) {
        process.exit()
      }
    })
  }

  get()
  get()
  setImmediate(function () {
    get()
  })
  setTimeout(function () {
    get()
  }, 50)
  setTimeout(function () {
    get()
  }, 200)

})