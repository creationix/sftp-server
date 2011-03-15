var Net = require('net'),
    ChildProcess = require('child_process'),
    Util = require('util'),
    createParser = require('./parser');
eval(require('./constants'));

// Proxy to real sftp server and trace conversation
function Proxy(client) {
  var child = ChildProcess.spawn("/usr/lib/openssh/sftp-server", ["-e"]);
  client.pipe(child.stdin);
  child.stdout.pipe(client);
  client.on('data', function (chunk) {
    console.log("IN  " + chunk.inspect());
  });
  child.stderr.pipe(process.stdout, { end: false });
  createParser(client, function (type, args) {
    console.log("IN  " + FXP_LOOKUP[type] + " " + Util.inspect(args, false, 3));
  });
  child.stdout.on('data', function (chunk) {
    console.log("OUT " + chunk.inspect());
  });
  createParser(child.stdout, function (type, args) {
    console.log("OUT " + FXP_LOOKUP[type] + " " + Util.inspect(args, false, 3));
  });
}

Net.createServer(Proxy).listen(6000);
console.log("sftp-server listening on port 6000");


