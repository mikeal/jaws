# Jaws (this is not a framework)

```javascript
var jaws = require("jaws")
var app = jaws()
app.route("/to/:place", function (req, res) {
  // This is where your code goes.
})
app.httpServer.listen(80, function () {
  console.log("Running now.")
})
```

#### Routes

Jaws is an API for dealing with HTTP, it is not a framework. Say it with me **"Jaws is not a framework."**

You create a Jaws instance which is what you hang your routes off of.

The routes you create are also objects which you can add properties to.

```javascript
app.route('/input', function (req, res) {
  // This is where code you write to take input goes.
})
.methods("PUT", "POST")
;
```

That would be how you could require that the HTTP methods `PUT` and `POST` were used and if not a proper HTTP error would be returned.

You can also add `conditions` to routes, code that will be executed before the handler and is required for that route. All conditions fire at once and are not ordered or sequential.

```javascript
app.route('/me', function (req, res) {
  res.html(templateRender(req.user))
})
.must(function (req, res, cb) {
  if (!req.headers.cookie) cb(new Error('No cookie header'))
  getUserByToken(req.headers.cookie, function (e, user) {
    req.user = user
    cb(e, user)
  })
})
```

You can also add named conditions to the application. All conditions will fire for every request but HTTP errors will only be enforced for those that are required by each route.

```javascript
app.condition('auth', 401, function (req, res, cb) {
  if (!req.headers.cookie) cb(new Error('No cookie header'))
  getUserByToken(req.headers.cookie, function (e, user) {
    req.user = user
    cb(e, user)
  })
})

app.route('/me', function (req, res) {
  res.html(templateRender(req.user))
})
.must('auth')

// This will still work without auth because there's no `must()` call.
app.route('/').file('index.html')
```

And lastly, you can listen to events fired for application level conditions.

```javascript
app.condition('auth', 401, function (req, resp, cb) {
  if (!req.headers.cookie) cb(new Error('No cookie header'))
  getUserByToken(req.headers.cookie, function (e, user) {
    req.user = user
    cb(e, user)
  })
})

app.route('/user/:userid', function (req, resp) {
  resp.statusCode = 200
  resp.end(req.user)
})
.condition(401, function (req, resp, cb) {
  req.on('condition.auth', function (e, user) {
    if (req.user.id !== req.routes.params.userid) return cb('You can only access your own user document.')
    cb(null, user)
  })
})
.must('auth')
;
```

#### Aggressive Caching

Jaws has the most aggressive caching semantics of any HTTP API I know of. **The full body of every GET request is cached by URL in an LRU cache and held indefinitely.**

The only way to clear something from cache is to flush it by URL or matching route.

```javascript
pubsub.on('change', function (id) {
  if (id === 'globals') {
    // When pubsub tells us the globals change flush all our pages
    app.flush('/pages/*')
  }
  // When pubsub tells us an id changes flush the web page for it
  app.flush('/pages/'+id)
})
```

You can also flush the entire cache quite easily.

```javascript
// Regularly flush the whole cache
setInterval(1000 * 60 * 60, function () {
  app.flush()
})
```

For obvious reasons HTTP methods other than `HEAD` and `GET` are not cached. You can also avoid the caching of a route by using `nocache()`.

```javascript
app.route('/dynamic',function (req, res) {
  // Your app code.
})
.nocache()
;
```


## API

#### Application

* `condition(name, [statusCode], cb)` - Add a condition globally to the application. cb in form of HTTP req/res + final callback `function (req, res, cb) {cb(error, success)}`. All conditions will fire for all requests but only routes that use `must()` will get an HTTP error if the callback gets an error.
* `route(pattern, [cb])` - Create and return a Route instance for `pattern`. Optionally pass a handler in form of HTTP req/res `function (req, res) {}`.
* `flush([pattern])` - Flush cache entries that match `pattern`. Flushes entire cache when no pattern is given.
* `addHeader(name, value)` - Add a header to all responses.

#### Route

* `must(*names)` - Require named conditions be fulfilled. Accepts as many arguments as you like.
* `methods(*names)` - Only accept requests of the given HTTP methods. Lowercase method names are allowed.
* `condition(cb)` - Add a condition to this route. cb in form of HTTP req/res + final callback `function (req, res, cb) {cb(error, success)}`.
* `nocache()` - Do not attempt to cache this route.
* `files(directory)` - Serve the files from this directory for this route. For obvious reason the route should end in `/*`
* `file(filepath)` - Serve a static file for this route.

### Convenience methods

Jaws sparingly adds some methods to the node's request and response objects for your convenience.

#### Request

* `body(cb)` - Parse the incoming request body and call `cb`. JSON and URL encoded bodies will be parsed. cb is standard callback interface `function (error, body) {}`.
* `route` - A [mapleTree](https://github.com/saambarati/mapleTree) route instance. `req.route.params` is most used and holds the parsed request params.

#### Response

* `error(err, [statusCode])` - Return an HTTP error. Accept instances of Error and text and, optionally, a statusCode (defaults to 500).
* `notfound()` - Return an HTTP 404.
* `html(body, [statusCode])` - Write the HTML body, set proper headers, and end the response.
* `json(obj, [statusCode])` - Safely serialize (uses [json-stringify-safe](https://github.com/isaacs/json-stringify-safe)) the object to JSON, set proper headers, end the request.

