// 2023-07-08 03:43:02.059 - info: FeedApp: {"e":"ORDER_TRADE_UPDATE","T":1688758982041,"E":1688758982045,"o":{"s":"XEMUSDT","c":"R01LRkpXT7C4","S":"SELL","o":"LIMIT","f":"GTC","q":"7259","p":"0.0275","ap":"0.0275","sp":"0","x":"TRADE","X":"FILLED","i":6437837518,"l":"7259","z":"7259","L":"0.0275","n":"0.03992450","N":"USDT","T":1688758982041,"t":86171692,"b":"0","a":"0","m":true,"R":false,"wt":"CONTRACT_PRICE","ot":"LIMIT","ps":"BOTH","cp":false,"rp":"-0.36230000","pP":false,"si":0,"ss":0}}
// 2023-07-08 03:43:02.061 - info: R01::on_order_update|{"exchange":"BinanceU","symbol":"XEMUSDT","contract_type":"perp","metadata":{"result":true,"account_id":"jq_cta_02","order_id":6437837518,"client_order_id":"R01LRkpXT7C4","direction":"Sell","timestamp":"20230708034302041","fee":0.0399245,"update_type":"executed"},"timestamp":"20230708034302059","order_info":{"original_amount":7259,"filled":7259,"new_filled":7259,"avg_executed_price":0.0275,"submit_price":0.0275,"status":"filled"}}
// 2023-07-08 03:43:02.063 - info: FeedApp: {"e":"ORDER_TRADE_UPDATE","T":1688758982041,"E":1688758982045,"o":{"s":"XEMUSDT","c":"R01LRkpXT7C4","S":"SELL","o":"LIMIT","f":"GTC","q":"7259","p":"0.0275","ap":"0.0275","sp":"0","x":"TRADE","X":"FILLED","i":6437837518,"l":"7259","z":"7259","L":"0.0275","n":"0.03992450","N":"USDT","T":1688758982041,"t":86171692,"b":"0","a":"0","m":true,"R":false,"wt":"CONTRACT_PRICE","ot":"LIMIT","ps":"BOTH","cp":false,"rp":"-0.36230000","pP":false,"si":0,"ss":0}}
// 2023-07-08 03:43:02.062 - info: R01::on_order_update|jq_cta_02|XEMUSDT|Sell|ANTI_L|REVERSE|R01LRkpXT7C4 order 7259/7259 filled @0.0275/0.0275!
// 2023-07-08 03:43:02.062 - info: R01|XEMUSDT::{"status":"LONG","anti_order_sent":false,"pos":-3636,"real_pos":"","triggered":"","up":0.0275,"dn":0.0271,"long_enter":"","high_since_long":"","short_enter":0.0276,"low_since_short":0.0272,"bar_n":3,"bar_enter_n":0,"ep":0.0272,"af":0.06,"sar":0.0283,"stoploss_price":0.0283,"fee":0.62,"quote_ccy":95.54,"net_profit":-5.03}
// 2023-07-08 03:43:02.064 - info: R01::on_order_update|{"exchange":"BinanceU","symbol":"XEMUSDT","contract_type":"perp","metadata":{"result":true,"account_id":"jq_cta_02","order_id":6437837518,"client_order_id":"R01LRkpXT7C4","direction":"Sell","timestamp":"20230708034302041","fee":0.0399245,"update_type":"executed"},"timestamp":"20230708034302063","order_info":{"original_amount":7259,"filled":7259,"new_filled":7259,"avg_executed_price":0.0275,"submit_price":0.0275,"status":"filled"}}
// 2023-07-08 03:43:02.065 - info: R01::on_order_update|jq_cta_02|XEMUSDT|Sell|ANTI_L|REVERSE|R01LRkpXT7C4 order 7259/7259 filled @0.0275/0.0275!
// 2023-07-08 03:43:02.065 - info: R01|XEMUSDT::{"status":"SHORT","anti_order_sent":false,"pos":-3636,"real_pos":"","triggered":"","up":0.0275,"dn":0.0271,"long_enter":0.0275,"high_since_long":0.0275,"short_enter":"","low_since_short":"","bar_n":0,"bar_enter_n":1,"ep":0.0275,"af":0.02,"sar":0.0267,"stoploss_price":0.0283,"fee":0.66,"quote_ccy":95.54,"net_profit":-5.03}


class Demo {
    constructor() {

    }

    start() {
        console.log(arguments.callee.caller);
    }
}

let demo = new Demo();
demo.start();