var Net = require('net'),
    ChildProcess = require('child_process'),
    Constants = require('constants'),
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
  var queue = [];
  var waiting = false;

  var scope = {
    send: function send(type) {
      var args = Array.prototype.slice.call(arguments, 1);
      var chunk = encode(type, args);
      output.emit('data', chunk);
      if (queue.length) {
        console.log("Grabbing next from queue out of %s", queue.length);
        var next = queue.shift();
        next.fn.apply(scope, next.args);
      } else {
        console.log("Queue empty");
        waiting = false;
      }
    },
    status: function status(id, code, message) {
      scope.send(FXP_STATUS, id, code, message, "");
    },
    error: function error(id, err) {
      var code, message = err.message;
      switch (err.code) {
        case "ENOENT": code = FX_NO_SUCH_FILE; message = "No such file"; break;
        case "EACCES": code = FX_PERMISSION_DENIED; break;
        default: code = FX_FAILURE;
      }
      scope.send(FXP_STATUS, id, code, message, "");
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
    if (!Handlers.hasOwnProperty(typeName)) {
      throw new Error("Unknown type " + typeName);
    }

    if (!waiting) {
      waiting = true;
      console.log("No Queue");
      Handlers[typeName].apply(scope, args);
    } else {
      queue.push({fn: Handlers[typeName], args: args});
      console.log("Queueing, length %s", queue.length);
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
  FSTAT: function (id, handle) {
    var fd = handles[handle];
    var self = this;
    Fs.fstat(fd, function (err, stat) {
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
      console.log("Found %s filenames", filenames.length);
      if (err) { self.error(id, err); return; }
      var count = filenames.length;
      if (count === 0) {
        self.status(id, FX_EOF, "End of file");
        return;
      }
      var results = new Array(count);
      filenames.forEach(function (filename, i) {
        Fs.lstat(path + "/" + filename, function (err, stat) {
          console.log("Stat for %s", i);
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
      if (err) { self.error(id, err); return; }
      self.send(FXP_NAME, id, [{
        filename: resolvedPath,
        longname: resolvedPath,
        attrs: {}
      }]);
    });
  },
  OPEN: function (id, path, pflags, attrs) {
    var self = this;
    var flags =
      ((pflags & FXF_READ) ? Constants.O_RDONLY : 0) |
      ((pflags & FXF_WRITE) ? Constants.O_WRONLY : 0) |
      ((pflags & FXF_APPEND) ? Constants.O_APPEND : 0) |
      ((pflags & FXF_CREAT) ? Constants.O_CREAT : 0) |
      ((pflags & FXF_TRUNC) ? Constants.O_TRUNC : 0) |
      ((pflags & FXF_EXCL) ? Constants.O_EXCL : 0);
    Fs.open(path, flags, attrs.permissions, function (err, fd) {
      if (err) { self.error(id, err); return; }
      var handle = getHandle(fd);
      self.send(FXP_HANDLE, id, handle);
    });
  },
  READ: function (id, handle, pos, len) {
    if (!handles.hasOwnProperty(handle)) { throw new Error("Invalid Handle"); }
    var self = this;
    var fd = handles[handle];
    var offset = 0;
    var buffer;
    Fs.fstat(fd, function (err, stat) {
      if (err) { self.error(id, err); return; }
      if (stat.size < len) { len = stat.size; }
      buffer = new Buffer(len);
      if (len > 0) {
        getData();
      } else {
        done();
      }
    });
    function getData() {
      Fs.read(fd, buffer, offset, len, pos, onRead);
    }
    function onRead(err, bytesRead) {
      if (err) { self.error(id, err); return; }
      if (bytesRead < len) {
        offset += bytesRead;
        pos += bytesRead;
        len -= bytesRead;
        getData();
        return;
      }
      done();
    }
    function done() {
      self.send(FXP_DATA, id, buffer);
    }
  },
  REMOVE: function (id, path) {
    var self = this;
    Fs.unlink(path, function (err) {
      if (err) { self.error(id, err); return; }
      self.status(id, FX_OK, "Success");
    });
  },
  SETSTAT: function (id, path, attrs) {
    console.log("WARNING, node.js doesn't have SETSTAT");
    this.status(id, FX_OK, "Success");
  },
  MKDIR: function (id, path, attrs) {
    var self = this;
    Fs.mkdir(path, attrs.permissions, function (err) {
      if (err) { self.error(id, err); return; }
      self.status(id, FX_OK, "Success");
    });
  },
  RMDIR: function (id, path) {
    var self = this;
    Fs.rmdir(path, function (err) {
      if (err) { self.error(id, err); return; }
      self.status(id, FX_OK, "Success");
    });
  },
  RENAME: function (id, oldPath, newPath) {
    var self = this;
    Fs.rename(oldPath, newPath, function (err) {
      if (err) { self.error(id, err); return; }
      self.status(id, FX_OK, "Success");
    });
  },
  WRITE: function (id, handle, pos, data) {
    if (!handles.hasOwnProperty(handle)) { throw new Error("Invalid Handle"); }
    var self = this;
    var fd = handles[handle];
    var offset = 0;
    var left = data.length;
    writeChunk();
    function writeChunk() {
      Fs.write(fd, data, offset, left, pos, onWrite);
    }
    function onWrite(err, bytesWritten) {
      if (err) { self.error(id, err); return; }
      if (bytesWritten < left) {
        pos += bytesWritten;
        offset += bytesWritten;
        left -= bytesWritten;
        writeChunk();
      }
      self.status(id, FX_OK, "Success");
    }
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


