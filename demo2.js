const EventEmitter = require("events");
const emitter = new EventEmitter.EventEmitter();

emitter.emit("UPDATE", "=== HELLO");