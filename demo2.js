const moment = require("moment");

// let now = moment();
// // let ts = moment.utc("20240401000000012", 'YYYYMMDDHHmmssSSS')
// // let ts = moment.utc("202403311500000", 'YYYYMMDDHHmmssSSS').utcOffset("+0800");
// // let ts = moment("20240401000000012", 'YYYYMMDDHHmmssSSS').utcOffset("+0800");
// let ts = moment("20240401000000012", 'YYYYMMDDHHmmssSSS');

// console.log('start ' + now.startOf('month'));
// // console.log(ts, now.utcOffset("+0800").startOf('month'), ts >= now.startOf("month"));
// console.log(ts, now.startOf('month'), ts >= now.startOf("month"));

// let a = [1, 2, 3];
// console.log(a.slice(1));
// console.log(a.slice(a.length - 2));
// console.log(a[0]);

// console.log(moment().format("YYYYMMDDHHmmssSSS"));
// console.log(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000");

// moment.utc("20240401000000012");
// moment.utc(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000");

let current_month_start = moment.utc(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000", 'YYYYMMDDHHmmssSSS');
// let current_month_start = moment.utc(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000");
// console.log(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000");
console.log(moment().format("YYYYMMDDHHmmssSSS").slice(0, 6) + "01000000000", current_month_start);

// console.log(moment.utc("20240401000000012", 'YYYYMMDDHHmmssSSS'));