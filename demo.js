const schedule = require('node-schedule');
const utils = require("./utils/util_func");

schedule.scheduleJob('30 * * * * *', function() {
    console.log(utils._util_get_human_readable_timestamp());
});