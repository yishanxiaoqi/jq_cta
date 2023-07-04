require("./config/typedef");
const Intercom = require("./module/intercom");

var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_MARKET`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];

var intercom = new Intercom(intercom_config);

// console.log(intercom);
// console.log(intercom.carriers);


intercom.on("ORDER_UPDATE", console.log, INTERCOM_SCOPE.MARKET);