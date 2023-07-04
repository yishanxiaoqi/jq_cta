require("./config/typedef");
const Intercom = require("./module/intercom");
const EventEmitter = require('events').EventEmitter;

var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_MARKET`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];

var intercom = new Intercom(intercom_config);
// var intercom = new EventEmitter();
// console.log(intercom);
// console.log(intercom.carriers);


// intercom.emit("ORDER_UPDATE", "test", INTERCOM_SCOPE.MARKET);
// intercom.on("ORDER_UPDATE", console.log, INTERCOM_SCOPE.MARKET);

intercom.on("ORDER_UPDATE", console.log);
intercom.emit("ORDER_UPDATE", "test");


// global.EventHandler = 

// console.log(global.EventHandler);