var fs = require('fs')
  , path = require('path')
  , http = require('http')
  , https = require('https')
  , util = require('util')
  , url = require('url')
  , events = require('events')
  , crypto = require('crypto')
  
  , mime = require('mime')
  , mapleTree = require('mapleTree')
  , lrucache = require('lru-cache')
  ;

function Application (opts) {
  var self = this
  opts.max = opts.max || 1000
  
  self.lru = lrucache(opts)
  self.routes = new mapleTree.RouteTree()
  
  self.on('request', function (req, resp) {
    req.u = url.parse(req.url)
    if (req.method === 'GET' || req.method === 'HEAD') {
      var cached = self.lru.get(req.u.pathname)
      if (cached) return cached.emit('request', req, resp)
      
      // not in cache
      req.route = self.routes.match(req.u.pathname)
      cached = req.route.fn.request(req, resp)
      self.lru.set(req.u.pathname, cached)
      cached.emit('request', req, resp)
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
  this.routes.define(pattern, r) 
  return r
}
Application.prototype.add = function (url, stream) {
  self.lru.set(url, stream)
}
Application.prototype.flush = function (pattern) {
  if (!pattern) self.lru.reset()
  Object.keys(self.lru.cache).forEach(function (key) {
    // find matches and remove them
  })
}

function Route (app, pattern, cb) {
  this.app = app
  this.pattern = pattern
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
    
    return cached
  }
}
Route.prototype.file = function (path, watchFile) {
  var cached = new Cached()
  
  fs.readFile(path, function (e, data) {
    if (e) {
      console.error(e)
      cached.writeHead(404, {'content-type': 'text/plain'})
      cached.end('Not Found')
      return
    }
    cached.writeHead(200, {'content-type': mime.lookup(path)})
    cached.end(data)
  })
  this.request = function (req, resp) {
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
  self.on('request', function (req, resp) {
    self.urls[req.u.pathname] = true
    
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
}
util.inherits(Cached, events.EventEmitter)
Cached.prototype.write = function (data) {
  if (!Buffer.isBuffer(data)) data = new Buffer(data)
  this.length += data.length
  this.data.push(data)
  this.emit('data', data)
}
Cached.prototype.writeHead = function (status, headers) {
  this.statusCode = status
  for (var i in headers) this.headers[i] = headers[i]
  this.emit('writeHead')
}
Cached.prototype.end = function (data) {
  if (data) this.write(data)
  this.ended = true
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
