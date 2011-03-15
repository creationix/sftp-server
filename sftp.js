var Net = require('net'),
    ChildProcess = require('child_process'),
    Util = require('util'),
    createParser = require('./parser'),
    encode = require('./encoder');
eval(require('./constants'));

// Proxy to real sftp server and trace conversation
function proxy(client) {
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

function real(client) {
  var scope = {
    send: function send(type) {
      var args = Array.prototype.slice.call(arguments, 1);
      var chunk = encode(type, args);
      console.log("OUT " + FXP_LOOKUP[type] + " " + Util.inspect(args, false, 3));
      console.log("OUT " + chunk.inspect());
      client.write(chunk);
    },
    status: function status(id, code, message) {
      scope.send(FXP_STATUS, id, code, message, "");
    },
    close: function () {
      client.close();
    }
  };
  client.on('data', function (chunk) {
    console.log("IN  " + chunk.inspect());
  });
  createParser(client, function (type, args) {
    console.log("IN  " + FXP_LOOKUP[type] + " " + Util.inspect(args, false, 3));
    var typeName = FXP_LOOKUP[type];
    if (Handlers.hasOwnProperty(typeName)) {
      Handlers[typeName].apply(scope, args);
    } else {
      throw new Error("Unknown type " + typeName);
    }
    
  });
}

var Handlers = {
  INIT: function (version) {
    if (version === 3) {
      this.send(FXP_VERSION, 3, {});
    } else {
      throw new Error("Invalid client version " + version);
    }
  }
};



Net.createServer(real).listen(6000);
console.log("sftp-server listening on port 6000");


