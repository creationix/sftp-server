var Net = require('net'),
    ChildProcess = require('child_process'),
    Util = require('util'),
    Fs = require('fs'),
    EventEmitter = require('events').EventEmitter,
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
      output.emit('data', chunk);
    },
    status: function status(id, code, message) {
      scope.send(FXP_STATUS, id, code, message, "");
    },
    error: function error(id, err) {
      var code;
      switch (err.code) {
        case "ENOENT": code = FX_NO_SUCH_FILE; break; 
        case "EACCES": code = FX_PERMISSION_DENIED; break;
        default: code = FX_FAILURE;
      }
      scope.send(FXP_STATUS, id, code, err.message, "");
    }
  };
  var output = new EventEmitter();
  
  client.on('data', function (chunk) {
    console.log("IN  " + chunk.inspect());
  });
  output.on('data', function (chunk) {
    console.log("OUT " + chunk.inspect());
    client.write(chunk);
  });
  createParser(output, function (type, args) {
    console.log("OUT " + FXP_LOOKUP[type] + " " + Util.inspect(args, false, 3));
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
    if (version !== 3) { throw new Error("Invalid client version " + version); }
    this.send(FXP_VERSION, 3, {"tim@creationix.com":"1"});
  },
  STAT: function (id, path) {
    var self = this;
    Fs.stat(path, function (err, stat) {
      if (err) { self.error(id, err); }
      else { self.send(FXP_ATTRS, id, stat); }
    });
  },
  LSTAT: function (id, path) {
    var self = this;
    Fs.lstat(path, function (err, stat) {
      if (err) { self.error(id, err); }
      else { self.send(FXP_ATTRS, id, stat); }
    });
  },
  OPENDIR: function (id, path) {
    var handle = getHandle(path);
    this.send(FXP_HANDLE, id, handle);
  },
  READDIR: function (id, handle) {
    if (!handles.hasOwnProperty(handle)) { throw new Error("Invalid Handle " + JSON.stringify(handle)); }
    var path = handles[handle];
    if (path === null) {
      this.status(id, FX_EOF, "End of file");
      return;
    }
    var self = this;
    Fs.readdir(path, function (err, filenames) {
      if (err) { self.error(id, err); return; }
      var count = filenames.length;
      var results = new Array(count);
      filenames.forEach(function (filename, i) {
        Fs.lstat(path + "/" + filename, function (err, stat) {
          if (err) { self.error(id, err); return; }
          results[i] = {
            filename: filename,
            longname: filename,
            attrs: stat
          };
          count--;
          if (count === 0) {
            self.send(FXP_NAME, id, results);
            handles[handle] = null;
          }
        });
      });
    });
  },
  CLOSE: function (id, handle) {
    delete handles[handle];
    this.status(id, FX_OK, "Success");
  },
  READLINK: function (id, path) {
    var self = this;
    Fs.readlink(path, function (err, resolvedPath) {
      if (err) { self.error(err); return; }
      self.send(FXP_NAME, id, [{
        filename: resolvedPath,
        longname: resolvedPath,
        attrs: {}
      }]);
    });
  }
};
var handles = [];
function getHandle(path) {
  var i = 0;
  while (handles.hasOwnProperty(i)) {
    i++;
  }
  handles[i] = path;
  return i.toString();
}



Net.createServer(real).listen(6000);
console.log("sftp-server listening on port 6000");


