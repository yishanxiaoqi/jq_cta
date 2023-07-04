require("./config/typedef");
const Intercom = require("./module/intercom");

var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];

var intercom = new Intercom(intercom_config);

intercom.on("MARKET_DATA", console.log, INTERCOM_SCOPE.FEED);

// global.EventHandler = 
// console.log(global.EventHandler);