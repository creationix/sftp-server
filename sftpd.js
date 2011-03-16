#!/usr/bin/env node
var Net = require('net'),
    Protocol = require('./protocol');

Net.createServer(function (client) {
  Protocol(client, client);
}).listen(6000);
console.error("sftpd server listening on port 6000");


