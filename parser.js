eval(require('./constants'));
var Formats = require('./formats');

module.exports = createParser;

function createParser(stream, callback) {
  var mode = 0;
  var size, offset, type, body;
  stream.on('data', function (chunk) {
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
            var message = decode(body, type);
            callback(message.type, message.args);
            mode = 0;
          }
          break;
      }
      i++;
    }
  });  
}

function decode(body, type) {
  var typeName = FXP_LOOKUP[type];
  if (!typeName) { throw new Error("Unknown type " + type); }
  var format = Formats[typeName];
  if (!format) { throw new Error("No known format for " + typeName); }
  var offset = 0;
  var parts = new Array(format.length);
  var value;
  for (var i = 0, l = format.length; i < l; i++) {
    switch (format[i]) {
      case 'uint32':
        value = readInt32(body, offset);
        offset += 4;
        break;
      case 'uint64':
        value = readInt64(body, offset);
        offset += 8;
        break;
      case 'string':
        value = readString(body, offset);
        offset += 4 + value.length;
        break;
      case 'buffer':
        value = readBuffer(body, offset);
        offset += 4 + value.length;
        break;
      case "PAIRS":
        value = readPairs(body, offset);
        offset += value.consumed;
        break;
      case "ATTRS":
        value = readAttrs(body, offset);
        offset += value.consumed;
        break;
      case "NAMES":
        value = readNames(body, offset);
        offset += value.consumed;
        break;
      default:
        throw new Error("Unknown format " + format[i]);
    }
    parts[i] = value;
  }
  if (offset !== body.length) {
    console.log("WARNING: Didn't consume entire message\n\t" + body.slice(offset).inspect());
  }
  return {type: type, args: parts};
}

function readInt32(buffer, offset) {
  return (buffer[offset] << 24) +
         (buffer[offset + 1] << 16) +
         (buffer[offset + 2] << 8) +
          buffer[offset + 3];
}

function readInt64(buffer, offset) {
  var high = readInt32(buffer, offset);
  var low = readInt32(buffer, offset + 4);
  return low + high * 0x100000000;
}

function readString(buffer, offset) {
  var length = readInt32(buffer, offset);
  var o = offset + 4;
  return buffer.toString('ascii', o, o + length);
}

function readBuffer(buffer, offset) {
  var length = readInt32(buffer, offset);
  var o = offset + 4;
  return buffer.slice(o, o + length);
}

function readPairs(buffer, offset) {
  var pairs = {};
  var k, v;
  var start = offset;
  while (offset < buffer.length) {
    if (!k) {
      k = readString(buffer, offset);
      offset += 4 + k.length;
    } else {
      v = pairs[k] = readString(buffer, offset);
      offset += 4 + v.length;
      k = undefined;
    }
  }
  Object.defineProperty(pairs, "consumed", {value: offset - start});
  return pairs;
}

function readAttrs(buffer, offset) {
  var attrs = {};
  var start = offset;
  var flags = readInt32(buffer, offset);
  offset += 4;
  if (flags & ATTR_SIZE) {
    attrs.size = readInt64(buffer, offset);
    offset += 8;
  }
  if (flags & ATTR_UIDGID) {
    attrs.uid = readInt32(buffer, offset);
    offset += 4;
    attrs.gid = readInt32(buffer, offset);
    offset += 4;
  }
  if (flags & ATTR_PERMISSIONS) {
    attrs.permissions = readInt32(buffer, offset);
    offset += 4;
  }
  if (flags & ATTR_ACMODTIME) {
    attrs.atime = readInt32(buffer, offset);
    offset += 4;
    attrs.mtime = readInt32(buffer, offset);
    offset += 4;
  }
  if (flags & ATTR_EXTENDED) {
    // TODO: Implement ATTR_EXTENDED
    // uint32   extended_count present only if flag SSH_FILEXFER_ATTR_EXTENDED
    // string   extended_type
    // string   extended_data
    // ...      more extended data (extended_type - extended_data pairs),
    //          so that number of pairs equals extended_count
    throw new Error("ATTR_EXTENDED NOT IMPLEMENTED");
  }
  Object.defineProperty(attrs, "consumed", {value: offset - start});
  return attrs;
}

function readNames(buffer, offset) {
  var start = offset;
  var count = readInt32(buffer, offset);
  offset += 4;
  var names = new Array(count);
  for (var i = 0; i < count; i++) {
    var item = names[i] = {};
    item.filename = readString(buffer, offset);
    offset += 4 + item.filename.length;
    item.longname = readString(buffer, offset);
    offset += 4 + item.longname.length;
    item.attrs = readAttrs(buffer, offset);
    offset += item.attrs.consumed;
  }
  Object.defineProperty(names, "consumed", {value: offset - start});
  return names;
}

