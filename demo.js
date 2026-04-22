// import Decimal from "decimal.js";
const Decimal = require('decimal.js');

// let tick_size = 1e-07;
let tick_size = 0.0000001;

const x = new Decimal(tick_size);
console.log(new Decimal(tick_size).decimalPlaces());

// console.log(tick_size.toFixed(7));
// console.log(tick_size.toString());
// let point_level = Number.isInteger(+tick_size) ? 0 : tick_size.toString().split('.')[1].length;
// console.log(point_level);