var fs = require('fs')
  , path = require('path')
  , http = require('http')
  , https = require('https')
  , util = require('util')
  , url = require('url')
  , events = require('events')
  , crypto = require('crypto')
  , zlib = require('zlib')
  , domain = require('domain')
  , urlparse = require('url').parse
  , qs = require('querystring')

  , mime = require('mime')
  , mapleTree = require('mapleTree')
  , lrucache = require('lru-cache')
  , safeStringify = require('json-stringify-safe')
  ;

function getMime (contenttype) {
  if (contenttype.slice(0, 'application/json'.length) === 'application/json') return 'json'
  if (contenttype.slice(0, 'application/x-www-form-urlencoded'.length) === 'application/x-www-form-urlencoded') return 'url'
  return null
}

function Application (opts) {
  var self = this
  opts.max = opts.max || 1000

  self.lru = lrucache(opts)
  self.routes = new mapleTree.RouteTree()
  self.conditions = {}
  self.globalHeaders = {}

  self.on('request', function (req, resp) {
    var d = domain.create()
    d.on('error', function (e) {
      console.error(e.stack)

      resp.statusCode = 500
      if (!resp._headerSent) {
        resp.setHeader('content-type', 'text-plain')
        resp.write(e.stack)
      }
      try { resp.end() }
      catch(e) {}
    })
    d.add(req)
    d.add(resp)
    d.run(function () {

      req._met = {}

      req.body = function (cb) {
        var buffers = []
          , size = 0
          , mime = getMime(req.headers['content-type'] || '')
          ;
        if (!mime) {
          var e = new Error('invalid content type.')
          e.statusCode = 400
          return cb(e)
        }

        req.on('data', function (chunk) {
          buffers.push(chunk)
          size += chunk.length
        })
        req.on('end', function () {
          var i = 0
          var buffer = new Buffer(size)
          buffers.forEach(function (chunk) {
            chunk.copy(buffer, i, 0, chunk.length)
            i += chunk.length
          })

          var body
          if (mime === 'json') {
            try {body = JSON.parse(buffer.toString())}
            catch (e) {return cb(e)}
          } else if (mime === 'url') {
            try {body = qs.parse(buffer.toString())}
            catch (e) {return cb(e)}
          } else {
            var e = new Error('invalid content type.')
            e.statusCode = 400
            cb(e)
            return
          }
          cb(null, body)
        })
      }

      resp.error = function (err, statusCode) {
        resp.statusCode = statusCode || err.statusCode || 500
        resp.setHeader('content-type', 'text/plain')
        if (typeof err === 'string') {
          resp.end(err)
        } else {
          if (err.message) resp.end(err.message)
          else resp.end('error')
        }
      }

      resp.notfound = function (data) {
        resp.error(data || 'Not Found', 404)
      }

      resp.html = function (data, statusCode) {
        resp.setHeader('content-type', 'text/html')
        resp.statusCode = statusCode || 200
        resp.end(data)
      }

      resp.json = function (obj, statusCode) {
        var body = safeStringify(obj)
        if (!body) return resp.error(new Error('JSON.stringify() failed'))
        resp.setHeader('content-type', 'application/json')
        resp.statusCode = statusCode || 200
        resp.end(body)
      }

      for (var i in self.globalHeaders) {
        resp.setHeader(i, self.globalHeaders[i])
      }

      var u = urlparse('http://localhost' + req.url).pathname

      function getRoute (cb) {
        req.route = self.routes.match(u)
        if (!req.route || !req.route.fn) {
          resp.notfound()
          return
        }
        var r = req.route.fn()

        if (r._methods && r._methods.indexOf(req.method) === -1) return resp.error('Method not allowed.', 405)

        // condition() handling
        var done = 0
        function next () {
          if (done === 0) return done += 1
          // Route.must() handling/
          if (r._must) {
            for (var i=0;i<r._must.length;i++) {
              var v = req._met[r._must[i]]
              if (!v) return resp.error(new Error('Route requires condition that does not exist.'))
              if (v[0]) return resp.error(v[0], v[1] || 500)
            }
          }
          cb(r)
        }

        self.verify(req, resp, next)
        r.verify(req, resp, next)
      }

      if (req.method === 'GET' || req.method === 'HEAD') {

        var cached = self.lru.get(req.url)

        getRoute(function (r) {
          if (cached) return cached.emit('request', req, resp)

          if (r._cachable) {
            cached = r.request(req, resp)
            self.lru.set(u, cached)
            return
          }
          r.request(req, resp)
        })
      } else {
        getRoute(function (r) {
          r.request(req, resp)
        })
      }

    })
  })

  function onRequest (req, resp) {
    self.emit('request', req, resp)
  }
  self.httpServer = http.createServer(onRequest)
  if (opts.ssl) self.httpsServer = https.createServer(opts.ssl, onRequest)
}
util.inherits(Application, events.EventEmitter)
Application.prototype.route = function (pattern, cb) {
  var r = new Route(this, pattern, cb)
  this.routes.define(pattern, function () {return r})
  return r
}
Application.prototype.flush = function (pattern) {
  var self = this
  if (!pattern) return self.lru.reset()
  var match = mapleTree.pattern(pattern) //returns a function
  self.lru.keys().forEach(function (url) {
    if (match(url)) self.lru.del(url)
  })
}
Application.prototype.addHeader = function (name, value) {
  this.globalHeaders[name] = value
}
Application.prototype.condition = condition

function condition (name, statusCode, handler) {
  if (!statusCode) {
    handler = name
    statusCode = 500
    name = 'unnamed-'+Math.floor(Math.random()*111111111)
  } else if (!handler) {
    handler = statusCode
    statusCode = 500
  }

  this.conditions[name] = [statusCode, handler]
  return name
}

Application.prototype.engineio = function (cb) {
  if (this._engineio) {
    if (cb) this._engineio.on('connection', cb)
    return this._engineio
  }
  this._engineio = engine
}

Application.prototype.verify = verify

function verify (req, resp, next) {
  var self = this
  var l = Object.keys(self.conditions).length
  if (l === 0) {
    next()
  }
  var i = 0

  for (var name in self.conditions) {
    ;(function (name) {
      var handler = self.conditions[name][1]
        , statusCode = self.conditions[name][0]
        ;
      handler(req, resp, function (e, o) {

        process.nextTick(function () {
          req.emit('condition.'+name, e, o)
        })
        if (e) {
          req._met[name] = [e, statusCode]
        } else {
          req._met[name] = [null, o]
        }

        i += 1
        if (i === l) next()
      })
    })(name)
  }
}

function Route (app, pattern, cb) {
  var self = this
  self.app = app
  self.pattern = pattern
  self._cachable = true
  self.conditions = {}
  if (cb) {
    self.request = function (req, resp) {
      if (self._cachable && (req.method === 'GET' || req.method === 'HEAD' )) {
        var cached = new Cached()

        resp._write = resp.write
        resp.write = function write (chunk) {
          if (!cached.statusCode) cached.writeHead(resp.statusCode, resp._headers)
          cached.write(chunk)
        }

        resp._end = resp.end
        resp.end = function end (chunk) {
          resp.end = resp._end
          resp.write = resp._write
          if (!cached.statusCode) cached.writeHead(resp.statusCode, resp._headers)
          cached.end(chunk)
        }
        cached.emit('request', req, resp)
      }

      cb(req, resp)
      return cached
    }
  }
}
util.inherits(Route, events.EventEmitter)
Route.prototype.files = function (filepath) {
  this.request = function (req, resp) {
    var cached = new Cached()

    req.route.extras.unshift(filepath)
    var p = path.join.apply(path.join, req.route.extras)
    if (p.slice(0, filepath.length) !== filepath) {
      resp.statusCode = 403
      return resp.end('Naughty Naughty!')
    }

    if (p === filepath) {
      cached.writeHead(404, {'content-type': 'text/plain'})
      cached.end('Not Found')
      console.error('Request to directory with no req.route.extras. You must use /* in your files route.')
      return
    }

    fs.readFile(p, function (e, data) {
      if (e) {
        cached.writeHead(404, {'content-type': 'text/plain'})
        cached.end('Not Found')
        return
      }
      cached.writeHead(200, {'content-type': mime.lookup(p)})
      cached.end(data)
    })
    cached.emit('request', req, resp)
    return cached
  }
}
Route.prototype.file = function (path, watchFile) {
  this.request = function (req, resp) {
    var cached = new Cached()

    fs.readFile(path, function (e, data) {
      if (e) {
        cached.writeHead(404, {'content-type': 'text/plain'})
        cached.end('Not Found')
        return
      }
      cached.writeHead(200, {'content-type': mime.lookup(path)})
      cached.end(data)
    })

    cached.emit('request', req, resp)
    return cached
  }
}
Route.prototype.nocache = function () {
  this._cachable = false
  return this
}
Route.prototype.condition = function () {
  var name = condition.apply(this, arguments)
  this.must(name)
  return this
}
Route.prototype.verify = verify

Route.prototype.must = function () {
  this._must = Array.prototype.slice.call(arguments)
  return this
}
Route.prototype.methods = function () {
  this._methods = Array.prototype.slice.call(arguments).map(function (m) {return m.toUpperCase()})
  return this
}

function Cached () {
  var self = this
  self.data = []
  self.length = 0
  self.ended = false
  self.headers = {}
  self.urls = {}
  self.methods = ['GET', 'HEAD']
  self.on('request', function (req, resp) {
    self.urls[req.url] = true

    function _do () {
      if (req.method === 'HEAD' && self.md5) {
        resp.writeHead(self.statusCode, self.headers)
        resp.end()
        return
      }
      if (req.headers['if-none-match'] && req.headers['if-none-match'] === self.md5) {
        var h = {}
        for (var i in self.headers) {
          if (i !== 'content-length') h[i] = self.headers[i]
        }
        resp.writeHead(304, h)
        resp.end()
        return
      }

      // gzipping
      if (self.compressed && req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/) ) {
        for (var i in self.headers) {
          resp.setHeader(i, self.headers[i])
        }
        resp.setHeader('content-encoding', 'gzip')
        resp.setHeader('content-length', self.compressed.length)
        resp.end(self.compressed)
        return
      }

      resp.writeHead(self.statusCode, self.headers)
      resp.end(self.buffer)
    }

    if (self.ended) {
      _do()
    } else {
      self.once('end', _do)
    }

  })
}
util.inherits(Cached, events.EventEmitter)
Cached.prototype.write = function (data) {
  if (!this._headerSent) {
    if (!this.statusCode) throw new Error('Must set statusCode before write()')
    this.emit('writeHead')
  }
  if (data.length === 0) return // noop empty data or gzip explodes
  if (!Buffer.isBuffer(data)) data = new Buffer(data)
  this.length += data.length
  this.data.push(data)
}
Cached.prototype.writeHead = function (status, headers) {
  this._headerSent = true
  this.statusCode = status
  for (var i in headers) this.headers[i] = headers[i]
  this.emit('writeHead')
}
Cached.prototype.setHeader = function (key, value) {
  this.headers[key] = value
}
Cached.prototype.getHeader = function (key) {
  return this.headers[key]
}
Cached.prototype.removeHeader = function (key) {
  delete this.headers[key]
}
Cached.prototype.end = function (data) {
  if (data) this.write(data)
  var self = this
  var buffer = Buffer.concat(this.data)
  this.headers['content-length'] = buffer.length
  delete this.data
  this.buffer = buffer
  this.md5 = crypto.createHash('md5').update(this.buffer).digest("hex")
  this.headers['etag'] = this.md5

  zlib.gzip(buffer, function (e, compressed) {
    if (e) return self.emit('error', e)
    self.compressed = compressed
    self.ended = true
    self.emit('end')
  })

}

module.exports = function (opts) {return new Application(opts || {})}
