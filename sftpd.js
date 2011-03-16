#!/usr/bin/env node
if (process.versions.node < "0.4.0") {
  require.paths.unshift(__dirname + "/node_modules");
}
var Net = require('net'),
    Protocol = require('protocol');

Net.createServer(function (client) {
  Protocol(client, client);
}).listen(6000);
console.error("sftpd server listening on port 6000");


