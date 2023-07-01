const EventEmitter = require("events");
const emitter = new EventEmitter.EventEmitter();

setInterval(() => {
    console.log("print");
    emitter.emit("UPDATE", "HELLO");
}, 1000);
emitter.on("UPDATE", console.log);

