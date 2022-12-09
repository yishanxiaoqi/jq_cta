var Pusher = require("pusher");
const logger = require("./module/logger.js");
// const EventEmitter = require('events').EventEmitter;
const WebSocket = require('ws');

const intercom = require("./utils.js")

// var intercom = new EventEmitter();
// intercom.on("Send Oorder", console.log);

let ws = new WebSocket('wss://fstream.binance.com/ws/bnbusdt@aggTrade')

var listener  = function listener(message) {
    console.log("message received!", message)
}

ws.onopen = () => {
    console.log('open connection')
    // 但是这样只能监听本script发出的消息，如何监听本地发出的消息呢？
    // 还是需要redis
    intercom.on("market_data_updated_from_exchange", listener)
}

ws.onclose = () => {
    console.log('close connection')
}

//接收 Server 發送的訊息
ws.onmessage = event => {
    // console.log(event)
    // intercom.emit("market_data_updated_from_exchange", "test")
}