var Net = require('net'),
    Fs = require('fs'),
    Util = require('util');

// SFTP protocol codes
var Codes = {
   INIT: 1,
   VERSION: 2,
   OPEN: 3,
   CLOSE: 4,
   READ: 5,
   WRITE: 6,
   LSTAT: 7,
   FSTAT: 8,
   SETSTAT: 9,
   FSETSTAT: 10,
   OPENDIR: 11,
   READDIR: 12,
   REMOVE: 13,
   MKDIR: 14,
   RMDIR: 15,
   REALPATH: 16,
   STAT: 17,
   RENAME: 18,
   READLINK: 19,
   LINK: 21,
   BLOCK: 22,
   UNBLOCK: 23,
   STATUS: 101,
   HANDLE: 102,
   DATA: 103,
   NAME: 104,
   ATTRS: 105,
   EXTENDED: 200,
   EXTENDED_REPLY: 201
};
var ReverseCodes = {};
Object.keys(Codes).forEach(function (name) {
  ReverseCodes[Codes[name]] = name;
});

var Statuses = {
  OK: 0,
  EOF: 1,
  NO_SUCH_FILE: 2,
  PERMISSION_DENIED: 3,
  FAILURE: 4,
  BAD_MESSAGE: 5,
  NO_CONNECTION: 6,
  CONNECTION_LOST: 7,
  OP_UNSUPPORTED: 8
};


var n = 0;
Net.createServer(function (client) {
  var id = n++;
  var parser = new Parser(client);

  function send(typeName /* args*/) {
    var args = Array.prototype.slice.call(arguments, 1);
    console.log("OUT %s %s", typeName, Util.inspect(args));
    var response = encode(typeName, args);
    console.log("OUT " + response.inspect());
    client.write(response);
  }
  
  function error(id, err) {
    var status = Statuses.FAILURE;
    if (err.code === "ENOENT") { status = Statuses.NO_SUCH_FILE; }
    else if (err.code === "EACCES") { status = Statuses.PERMISSION_DENIED; }
    send("STATUS", id, status, err.message, "en");
  }


  parser.on("INIT", function (version) {
    if (version !== 3) { throw new Error("Unsupported client version"); }
    send("VERSION", 3);
  });
  
  parser.on("STAT", function (id, path) {
    Fs.stat(path, onStat.bind(null, id));
  });
  parser.on("LSTAT", function (id, path) {
    Fs.lstat(path, onStat.bind(null, id));
  });
  
  function onStat(id, err, stat) {
    if (err) {
      error(id, err);
      return;
    }
    var attrs = {
      size: stat.size,
      uid: stat.uid,
      gid: stat.gid,
      permissions: stat.mode,
      atime: stat.atime.getTime() / 1000,
      mtime: stat.mtime.getTime() / 1000
    };
    send("ATTRS", id, attrs);
  }
  
}).listen(6000);
console.log("sftp-server listening on port 6000");

var EventEmitter = require('events').EventEmitter;
function Parser(stream) {
  EventEmitter.call(this);
  var self = this;
  var mode = 0;
  var size, offset, type, body;
  stream.on('data', function (chunk) {
    console.log("IN  " + chunk.inspect());
    var l = chunk.length;
    var i = 0;
    while (i < l) {
      switch (mode) {
        // 0 - 3 are length bytes
        case 0: 
          size = chunk[i] << 24;
          mode = 1; break;
        case 1:
          size += chunk[i] << 16;
          mode = 2; break;
        case 2:
          size += chunk[i] << 8;
          mode = 3; break;
        case 3:
          size += chunk[i];
          mode = 4; break;
        case 4:
          type = chunk[i];
          size--;
          body = new Buffer(size);
          offset = 0;
          mode = 5; break;
        case 5:
          // TODO: speed this up by using memcpy for chunks
          if (offset < size) {
            body[offset] = chunk[i];
            offset++;
          }
          if (offset === size) {
            var parts = decode(body, type);
            console.log("IN  %s %s", parts[0], Util.inspect(parts.slice(1)));
            self.emit.apply(self, parts);
            mode = 0;
          }
          break;
      }
      i++;
    }
  });  
}
Parser.prototype.__proto__ = EventEmitter.prototype;

var Formats = {
  INIT: ["uint32"],
  VERSION: ["uint32"],
  STAT: ["uint32", "string"],
  STATUS: ["uint32", "uint32", "string", "string"],
  ATTRS: ["uint32", "ATTRS"]
}

function readInt32(buffer, offset) {
  return (buffer[offset] << 24) +
         (buffer[offset + 1] << 16) +
         (buffer[offset + 2] << 8) +
          buffer[offset + 3];
}
function writeInt32(buffer, offset, value) {
  buffer[offset] = value >>> 24;
  buffer[offset + 1] = value >>> 16;
  buffer[offset + 2] = value >>> 8;
  buffer[offset + 3] = value;
}
function writeInt64(buffer, offset, value) {
  var high = Math.floor(value / 0x100000000);
  var low = value - high * 0x100000000;
  writeInt32(buffer, offset, high);
  writeInt32(buffer, offset + 4, low);
}
function readString(buffer, offset) {
  var length = readInt32(buffer, offset);
  var o = offset + 4;
  return buffer.toString('ascii', o, o + length);
}
function writeString(buffer, offset, string) {
  var length = string.length;
  writeInt32(buffer, offset, length);
  buffer.write(string, "ascii", offset + 4, string);
}
function writeAttrs(buffer, offset, attrs) {
  writeInt32(buffer, offset, 15); // ATTR_SIZE | ATTR_UIDGID | ATTR_PERMISSIONS | ACMODTIME);
  writeInt64(buffer, offset + 4, attrs.size); // present only if flag ATTR_SIZE
  writeInt32(buffer, offset + 12, attrs.uid); // present only if flag ATTR_UIDGID
  writeInt32(buffer, offset + 16, attrs.gid); // present only if flag ATTR_UIDGID
  writeInt32(buffer, offset + 20, attrs.permissions); // present only if flag ATTR_PERMISSIONS
  writeInt32(buffer, offset + 24, attrs.atime); // present only if flag ACMODTIME
  writeInt32(buffer, offset + 28, attrs.mtime); // present only if flag ACMODTIME
}  

function encode(typeName, args) {
  var format = Formats[typeName];
  if (!format) { throw new Error("Unknown format " + typeName); }
  var type = Codes[typeName];
  if (args.length !== format.length) { throw new Error("Expected %s args for %s, but only got %s args", format.length, typeName, args.length); }
  
  // Calculate body length
  var length = 1;
  for (var i = 0, l = format.length; i < l; i++) {
    switch (format[i]) {
      case "uint32":
        length += 4;
        break;
      case "string":
        length += args[i].length + 4;
        break;
      case "ATTRS":
        length += 32;
        break;
      default: throw new Error("Unknown type " + Util.inspect(format[i]));
    }
  }
  
  // Init the buffer
  var buffer = new Buffer(length + 4);
  writeInt32(buffer, 0, length);
  buffer[4] = type;
  var offset = 5;
  
  // Fill in the buffer
  for (i = 0; i < l; i++) {
    var value = args[i];
    switch (format[i]) {
      case "uint32":
        writeInt32(buffer, offset, value);
        offset += 4;
        break;
      case "string":
        writeString(buffer, offset, value);
        offset += value.length + 4;
        break;
      case "ATTRS":
        writeAttrs(buffer, offset, value);
        offset += 32;
        break;
      default: throw new Error("Unknown type " + Util.inspect(format[i]));
    }
  }
  
  return buffer;
}

function decode(body, type) {
  var typeName = ReverseCodes[type];
  if (!typeName) { throw new Error("Unknown type %s", type); }
  var format = Formats[typeName];
  if (!format) { throw new Error("No known format for %s", typeName); }
  var offset = 0;
  var parts = new Array(format.length + 1);
  parts[0] = typeName;
  var value;
  for (var i = 0, l = format.length; i < l; i++) {
    switch (format[i]) {
      case 'uint32':
        value = readInt32(body, offset);
        offset += 4;
        break;
      case 'string':
        value = readString(body, offset);
        offset += 4 + value.length;
        break;
    }
    parts[i + 1] = value;
  }
  return parts;
}


