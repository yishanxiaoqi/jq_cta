const moment = require("moment");

var startDate = moment(new Date('2015-05-21T10:17:28.593Z'));
// Do your operations
var endDate   = moment(new Date('2015-05-21T11:10:28.593Z'));
var seconds = (startDate).diff(endDate, 'day');
console.log(seconds);