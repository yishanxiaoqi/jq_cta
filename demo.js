const moment = require('moment');

ts1 = "20250426181000000";
ts2 = "20250426181000000";

console.log(moment(ts1, "YYYYMMDDHHmmssSSS").diff(moment(ts2, "YYYYMMDDHHmmssSSS"), "seconds"));

console.log( parseInt((ts1.slice(0, 12) + '00000')), parseInt(ts2), parseInt((ts1.slice(0, 12) + '00000')) < parseInt(ts2) );
console.log( moment().format("HH:mm") );