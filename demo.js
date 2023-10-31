let ts = 1698751724000;
const utils = require("./utils/util_func");

console.log(utils.get_human_readable_timestamp(ts));
console.log(new Date(ts));