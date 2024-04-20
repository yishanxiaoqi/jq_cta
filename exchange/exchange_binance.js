require("../config/typedef.js");
require("../config/stratdef.js");
const WS = require("ws");
const moment = require("moment");
const randomID = require("random-id");
const rp = require("request-promise-native");
const querystring = require("querystring");


const utils = require("../utils/util_func.js");
const ExchangeBase = require("./exchange_base.js");
const logger = require("../module/logger.js");
const Intercom = require("../module/intercom.js");
const apiconfig = require("../config/apiconfig.json");
const token = require("../config/token.json");

class ExchangeBinance extends ExchangeBase {
    constructor(name, intercom) {
        super(name, intercom);
        
        this.account_ids = Object.keys(token).filter(x => x.split("_")[1] === "binance");
        this.subscription_list = SUBSCRIPTION_LIST.filter(x => x.split("|")[0] === this.name);
        this.ws_connections = {};
        this.listenKeys = {};
    }

    async _init_websocket() {
    }

    _get_rest_options(url, params, account_id = "test") {
        let apiSecret = token[account_id].apiSecret;
        let presign = querystring.stringify(params);
        let signature = utils.HMAC("sha256", apiSecret, presign);

        return {
            url: url + "?",
            postbody: presign + "&signature=" + signature
        };
    }

    async _query_account_via_rest(query) {
        let ref_id = query["ref_id"];
        let contract_type = query["contract_type"];
        let account_id = query["account_id"];

        let url = apiconfig.Binance.restUrl + apiconfig.Binance.restUrlQueryAccount;
        let params = this._get_rest_options(url, {
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            console.log(JSON.stringify(body));
            let assets = body["balances"].filter(e => (["BTC", "USDT", "BNB"].includes(e.asset)) || ((+e.free !== 0) && (+e.locked !== 0)));
            console.log(JSON.stringify(assets));

            let balance = {};
            for (let asset of assets) {
                balance[asset["asset"]] = {
                    "free": +asset["free"],
                    "locked": +asset["locked"],
                    "equity": +asset["free"] + +asset["locked"]
                }
            }

            cxl_resp = {
                exchange: EXCHANGE.BINANCE,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ACCOUNT,
                metadata: {
                    result: true,
                    account_id: account_id,
                    balance: balance,
                    timestamp: utils._util_get_human_readable_timestamp()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.BINANCE,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ACCOUNT,
                metadata: {
                    result: false,
                    account_id: account_id,
                    error_code: e.code || e.statusCode || 999999,
                    error_code_msg: e.msg || e.message,
                    error_stack: e.stack
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: REQUEST_ACTIONS.QUERY_ACCOUNT,
            strategy: this.name,
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }
}

module.exports = ExchangeBinance;

// var intercom_config = [
//     INTERCOM_CONFIG[`LOCALHOST_FEED`],
//     INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
// ];
// let bns = new ExchangeBinance("Binance", new Intercom(intercom_config));
// bns.start();