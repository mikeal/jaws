var fs = require('fs')
  , path = require('path')
  , child_process = require('child_process')
  ;
  
var files =
  fs.readdirSync(__dirname)
  .filter(function (file) {
    return file.slice(0, 'test-'.length) === 'test-'
  })
  
var code

function run (err) {
  if (err) {
    code = err
    console.error('FAIL')
  }
  if (!files.length) process.exit(code)
  var f = files.shift()
  console.log('Running', f)
  var child = child_process.exec('node '+path.join(__dirname, f), run)
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
}
run()
