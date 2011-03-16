#!/usr/bin/env node
if (process.versions.node < "0.4.0") {
  require.paths.unshift(__dirname + "/node_modules");
}
var Protocol = require('protocol');

Protocol(process.openStdin(), process.stdout);
console.error("sftp-server attached to stdin/stdout");


