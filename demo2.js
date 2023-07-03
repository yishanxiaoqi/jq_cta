var price = 0.0296;
var apiconfig = require("./config/apiconfig.json");
var symbol = "XEMUSDT";

var adj_price = Math.round(price * apiconfig.pricePrecision[symbol]) / apiconfig.pricePrecision[symbol];

console.log(adj_price);