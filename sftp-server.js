#!/usr/bin/env node
var Protocol = require('./protocol');

Protocol(process.openStdin(), process.stdout);
console.error("sftp-server attached to stdin/stdout");


