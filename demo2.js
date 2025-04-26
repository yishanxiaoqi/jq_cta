const moment = require("moment");

let ts = "20250426122733199";
let nextFundingTime = 1745647200000;

ts = moment(ts, format="YYYYMMDDHHmmssSSS");
nextFundingTime = new Date(nextFundingTime);

console.log(ts);
console.log(nextFundingTime);

console.log(ts.diff(nextFundingTime, 'minutes'));

let min_str = "1min";
console.log(parseInt(min_str.split("min")[0]));

let ts2  = moment(ts, format = "YYYYMMDDHHmmssSSS").add(3, 'minutes').format("YYYYMMDDHHmmssSSS");
console.log(ts2);