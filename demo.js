let client_order_id = "XES30m020u0VEsIXXF";
let track_ATR_multiplier = parseFloat(client_order_id.slice(6, 7) + "." + client_order_id.slice(7, 9));

console.log(track_ATR_multiplier, client_order_id.slice(6, 7) + "." + client_order_id.slice(7, 9));