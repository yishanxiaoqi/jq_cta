let client_order_id = 'SRE01hSR4AiBB';
let order_map = { "ANTI_S|REVERSE": { "client_order_id": "SRE01hSR4AiBB", "label": "ANTI_S|REVERSE", "price": 0.0464, "quantity": 4382, "time": 1705917600574, "ToBeDeleted": true, "ToBeDeletedTime": 1705917600645 }, "SRE01hSR4AiBB": { "label": "ANTI_S|REVERSE", "target": "LONG", "quantity": 4382, "time": 1705917600574, "filled": 3371, "ToBeDeleted": true, "ToBeDeletedTime": 1705917600645 }, "SRE01hSSTf8fd": { "label": "ANTI_S|STOPLOSS", "target": "EMPTY", "quantity": 2227, "time": 1705917600575, "filled": 0, "ToBeDeleted": true, "ToBeDeletedTime": 1705917600645 } }
let order_info = Object.entries(order_map[client_order_id]).filter((element) => ["label", "target", "quantity", "time", "filled"].includes(element[0])).map((element) => element[1]).join(",");

console.log(order_map[client_order_id]);
console.log(order_info);