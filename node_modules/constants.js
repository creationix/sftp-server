var SSH = {
  FXP: {
    INIT:             1,
    VERSION:          2,
    OPEN:             3,
    CLOSE:            4,
    READ:             5,
    WRITE:            6,
    LSTAT:            7,
    FSTAT:            8,
    SETSTAT:          9,
    FSETSTAT:        10,
    OPENDIR:         11,
    READDIR:         12,
    REMOVE:          13,
    MKDIR:           14,
    RMDIR:           15,
    REALPATH:        16,
    STAT:            17,
    RENAME:          18,
    READLINK:        19,
    SYMLINK:         20,
    STATUS:         101,
    HANDLE:         102,
    DATA:           103,
    NAME:           104,
    ATTRS:          105,
    EXTENDED:       200,
    EXTENDED_REPLY: 201
  },
  FX: {
    OK:                0,
    EOF:               1,
    NO_SUCH_FILE:      2,
    PERMISSION_DENIED: 3,
    FAILURE:           4,
    BAD_MESSAGE:       5,
    NO_CONNECTION:     6,
    CONNECTION_LOST:   7,
    OP_UNSUPPORTED:    8
  },
  FXF: {
    READ:   0x00000001,
    WRITE:  0x00000002,
    APPEND: 0x00000004,
    CREAT:  0x00000008,
    TRUNC:  0x00000010,
    EXCL:   0x00000020
  },
  ATTR: {
    SIZE:        0x00000001,
    UIDGID:      0x00000002,
    PERMISSIONS: 0x00000004,
    ACMODTIME:   0x00000008,
    EXTENDED:    0x80000000
  }
};
var code = "";
Object.keys(SSH).forEach(function (groupName) {
  var group = SSH[groupName];
  var reverse = {};
  Object.keys(group).forEach(function (name) {
    reverse[group[name]] = name;
    code += "var " + groupName + "_" + name + " = " + group[name] + ";\n";
  });
  code += "var " + groupName + "_LOOKUP = " + JSON.stringify(reverse) + ";\n";
});
module.exports = code;
//process.stdout.write(code);
