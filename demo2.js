// const logger = require("./module/logger.js");
// const EventEmitter = require('events').EventEmitter;

// var intercom = new EventEmitter();

// const intercom = require("./utils.js")

// intercom.emit("market_data_updated_from_exchange", "test")
// 'use strict';
// require("./config/typedef.js");

// console.log(DIRECTION);

var cfg = require("./config/cfg_R01.json");

console.log(cfg["symbols"].map((symbol) => {return `${symbol.toLowerCase()}@aggTrade`}));