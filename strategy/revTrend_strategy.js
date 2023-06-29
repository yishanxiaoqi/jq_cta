const WS = require("ws");
const EventEmitter = require("events");

var emitter = new EventEmitter.EventEmitter();
emitter.on("ORDER_UPDATE", console.log);
