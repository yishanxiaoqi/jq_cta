// const dict = {"apple": 1, "orange":10,"watermelon":5, "banana":15};
// const top3 = Object
//   .entries(dict) // create Array of Arrays with [key, value]
//   .sort(([, a],[, b]) => b-a) // sort by value, descending (b-a)
//   .slice(0,3) // return only the first 3 elements of the intermediate result
//   .map(([n])=> n); // and map that to an array with only the name

// console.log(top3);

// const summary = {"a": {"equity": 1}, "b": {"equity": 2}}
// let equity_summary = ["a", "b"].map(item => summary[item]["equity"]).reduce((a, b) => a + b, 0);
// console.log(equity_summary);

let a = [1, 2, 3];
console.log([0].concat(a));