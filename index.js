var fs = require('fs')
  , path = require('path')
  , http = require('http')
  , https = require('https')
  , util = require('util')
  , url = require('url')
  , events = require('events')
  , crypto = require('crypto')
  , zlib = require('zlib')
  
  , mime = require('mime')
  , mapleTree = require('mapleTree')
  , lrucache = require('lru-cache')
  ;

function Application (opts) {
  var self = this
  opts.max = opts.max || 1000
  
  self.lru = lrucache(opts)
  self.routes = new mapleTree.RouteTree()
  self.conditions = {}
  self.globalHeaders = {}
  
  self.on('request', function (req, resp) {
    resp.notfound = function (data) {
      resp.setHeader('content-type', 'text/plain')
      resp.statusCode = 404
      resp.end(data || 'Not Found')
    }
    
    resp.html = function (data) {
      resp.setHeader('content-type', 'text/html')
      resp.statusCode = 200
      resp.end(data)
    }
    
    var l = Object.keys(self.conditions).length
    if (l === 0) {
      finish()
    }
    var i = 0
      , met = {}
      ;
    for (var name in self.conditions) {
      (function (name){
        self.conditions[name](req, resp, function (e, bool) {
          if (e) met[name] = false
          else met[name] = bool
          i += 1
          if (i === l) finish()
        })
      })(name)
    }
    
    function finish () {
      for (var i in self.globalHeaders) {
        resp.setHeader(i, self.globalHeaders[i])
      }
      
      if (req.method === 'GET' || req.method === 'HEAD') {
        var cached = self.lru.get(req.url)
        if (cached) return cached.emit('request', req, resp)
      
        // not in cache
        req.route = self.routes.match(req.url)
        if (!req.route) return resp.notfound()
        if (!req.route.fn) return resp.notfound()
        
        var r = req.route.fn()
        // TODO implement must over the conditions system
        if (!r.request) console.error(r)
        cached = r.request(req, resp)
        self.lru.set(req.url, cached)
        return
      }
      req.route = self.routes.match(req.url)
      if (!req.route) return resp.notfound()
      if (!req.route.fn) return resp.notfound()
      r.request(req, resp)
    }
  })
  
  function onRequest (req, resp) {
    self.emit('request', req, resp)
  }
  self.httpServer = http.createServer(onRequest)
  self.httpsServer = https.createServer(onRequest)
}
util.inherits(Application, events.EventEmitter)
Application.prototype.route = function (pattern, cb) {
  var r = new Route(this, pattern, cb)
  this.routes.define(pattern, function () {return r})
  return r
}
Application.prototype.flush = function (pattern) {
  var self = this
  if (!pattern) self.lru.reset()
}
Application.prototype.condition = function (name, handler) {
  this.conditions[name] = handler
  return this
}
Application.prototype.addHeader = function (name, value) {
  this.globalHeaders[name] = value
}

function Route (app, pattern, cb) {
  this.app = app
  this.pattern = pattern
  if (cb) {
    this.request = function (req, resp) {
      var cached = new Cached()
      
      resp._write = resp.write
      resp.write = function write (chunk) {
        if (!cached.statusCode) cached.writeHead(resp.statusCode, resp._headers)
        cached.write(chunk)
        resp._write(chunk)
      }
      
      resp._end = resp.end
      resp.end = function end (chunk) {
        if (!cached.statusCode) cached.writeHead(resp.statusCode, resp._headers)
        cached.end(chunk)
        resp._end(chunk)
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
  this.request = function (req, resp) {
    cached.emit('request', req, resp)
    return cached
  }
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
    if (self.ended && req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/) ) {
      for (var i in self.headers) {
        resp.setHeader(i, self.headers[i])
      }
      resp.setHeader('content-encoding', 'gzip')
      resp.setHeader('content-length', self.compressed.length)
      resp.end(self.compressed)
      return
    }
    
    if (self.ended) {
      resp.writeHead(self.statusCode, self.headers)
      return resp.end(self.buffer)
    } else {
      if (self.statusCode) {
        resp.writeHead(self.statusCode, self.headers)
        self.data.forEach(function (chunk) {
          resp.write(chunk)
        })
      } else {
        self.once('writeHead', function () {
          resp.writeHead(self.statusCode, self.headers)
        })
      }
      self.on('data', function (chunk) {
        resp.write(chunk)
      })
      self.on('end', function () {
        resp.end()
      })
    }
  })
  self.compressor = new zlib.createGzip()
  self.compressedData = []
  self.compressedLength = 0
  self.compressor.on('data', function (chunk) {
    self.compressedData.push(chunk)
    self.compressedLength += chunk.length
  })
  self.compressor.on('end', function () {
    var i = 0
    var buffer = new Buffer(self.compressedLength)
    self.compressedData.forEach(function (chunk) {
      chunk.copy(buffer, i, 0, chunk.length)
      i += chunk.length
    })
    self.compressed = buffer
  })
}
util.inherits(Cached, events.EventEmitter)
Cached.prototype.write = function (data) {
  if (!this._headerSent) {
    if (!this.statusCode) throw new Error('Must set statusCode before write()')
    this.emit('writeHead')
  }
  if (!Buffer.isBuffer(data)) data = new Buffer(data)
  this.length += data.length
  this.data.push(data)
  this.compressor.write(data)
  this.emit('data', data)
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
  this.ended = true
  
  this.compressor.end()
  
  var i = 0
  var buffer = new Buffer(this.length)
  this.data.forEach(function (chunk) {
    chunk.copy(buffer, i, 0, chunk.length)
    i += chunk.length
  })
  this.headers['content-length'] = this.length
  delete this.data
  this.buffer = buffer
  this.md5 = crypto.createHash('md5').update(this.buffer).digest("hex")
  this.headers['etag'] = this.md5
  this.emit('end')
}

module.exports = function (opts) {return new Application(opts || {})}
