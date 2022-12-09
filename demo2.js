// const logger = require("./module/logger.js");
// const EventEmitter = require('events').EventEmitter;

// var intercom = new EventEmitter();

const intercom = require("./utils.js")

intercom.emit("market_data_updated_from_exchange", "test")