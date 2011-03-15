
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



