const utils = require("./utils/util_func");
const apiconfig = require("./config/apiconfig.json");

console.log(utils._util_get_key_by_value(apiconfig.BinanceU.orderTypeMap, "POST_ONLY"));