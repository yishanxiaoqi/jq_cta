/** const values */
EXCHANGE = {
    BINANCEU: "BinanceU",
    OKX: "OKX"
}

CONTRACT_TYPE = {
    PERP: "perp",
    SPOT: "spot",
    FUTURES: "futures"
}

ORDER_TYPE = {
    LIMIT: "limit",
    MARKET: "market",
    STOP_MARKET: "stop_market",
    STOP_LIMIT: "stop_limit",
    POST_ONLY: "post_only"
}

TRADE_SIDE = {
    BUY: "buy",
    SELL: "sell"
}

DIRECTION = {
    BUY: "Buy",
    SELL: "Sell",
    COVER: "Cover",
    SHORT: "Short"
}

ORDER_UPDATE_TYPE = {
    SUBMITTED: "submitted",
    CANCELLED: "cancelled",
    MODIFIED: "modified",
    EXECUTED: "executed",
    EXPIRED: "expired",
    LIQUIDATED: "liquidated"
}

ORDER_STATUS = {
    SUBMITTED: "new",
    CANCELLED: "cancelled",
    FILLED: "filled",
    PARTIALLY_FILLED: "partially_filled",
    MODIFIED: "modified"
}

MARKET_DATA = {
    TRADE: "trade",
    BESTQUOTE: "bestquote",
    ORDERBOOK: "orderbook",
    PRICE: "price",
    KLINE: "kline",
    INDEX: "index",
    RATE: "rate",
    LIQUIDATION: "liquadation",
    FUNDING: "funding",
    HOLDAMOUNT: "holdamount"
}

ORDER_ACTIONS = {
    SEND: 'place_order',
    CANCEL: 'cancel_order',
    INSPECT: 'inspect_order',
    MODIFY: 'modify_order'
};

ERROR_MSG = {
    // BinanceU - Send Order
    POST_ONLY_FAIL: "Due to the order could not be executed as maker, the Post Only order will be rejected. The order will not be recorded in the order history",
    
    // BinanceU - Cancel Order
    CANCEL_ORDER_FAIL: "Unknown order sent."

}

REQUEST_ACTIONS = {
    SEND_ORDER: 'place_order',
    CANCEL_ORDER: 'cancel_order',
    INSPECT_ORDER: 'inspect_order',
    INSPECT_ORDER_BATCH: 'inspect_order_batch',
    CANCEL_ALL_ORDER: 'cancel_all_orders',
    MODIFY_ORDER: 'modify_order',
    QUERY_POSITION: 'query_position',
    QUERY_ACCOUNT: 'query_account',
    QUERY_BALANCE: 'query_balance',
    QUERY_SUBACCOUNT_BALANCE: 'query_subaccount_balance',
    QUERY_ORDERS: 'query_orders',
    QUERY_MARGIN: 'query_margin',
    DEPOSIT: 'deposit',
    WITHDRAW: 'withdraw',
    QUERY_HISTORY_ORDERS: 'query_history_orders',
    QUERY_HOLD_AMOUNT: 'query_hold_amount',
    QUERY_LATEST_PRICE: 'query_latest_price',
    QUERY_LIQUIDATION: 'query_liquidation',
    QUERY_HISTORY_TRADES: 'query_history_trades',
    QUERY_WITHDRAWALS: 'query_withdrawals_history',
    QUERY_DEPOSITS: 'query_deposits_history',
    QUERY_QUANTITATIVE_RULES: 'query_quantitative_rules',
    GET_WALLET_ADDRESS: 'get_wallet_address',
    UPDATE_COMMENTS: 'update_comments',
    ADD_RECORD: 'add_record',
    LOAN: 'loan',
    TRANS_ASSET: 'trans_asset',
    REPAY: 'repay',
    QUERY_LOAN_HISTORY: 'query_loan_history',
    TRANSFER: 'transfer',
    SEND_ORDER_BATCH: 'place_order_batch',
    GET_QUOTE: 'get_quote'
};

INTERCOM_CHANNEL = {
    // Feed -> Strategy
    MARKET_DATA: "MARKET_DATA",         
    ORDER_UPDATE: "ORDER_UPDATE",
    WS_RESPONSE: "WS_RESPONSE",
    ACCOUNT_UPDATE: "ACCOUNT_UPDATE",
    // Strategy -> Feed 
    OKX_TRADE: "OKX_TRADE",
    
    // rest (strategy -> exg -> strategy)
    REQUEST_RESPONSE: "REQUEST_RESPONSE"         
}

INTERCOM_SCOPE = {
    FEED: "feed",
    STRATEGY: "strategy",
    UI: "ui"
}

INTERCOM_TYPE = {
    EVENT_EMITTER: 'EventEmitter',
    REDIS: 'Redis'
};

INTERCOM_CONFIG = {
    //===============LOCALHOST=====================
    LOCALHOST_FEED: {
        host: '127.0.0.1',
        port: '6379',
        auth: 'pass1',
        scope: INTERCOM_SCOPE.FEED
    },
    LOCALHOST_STRATEGY: {
        host: '127.0.0.1',
        port: '6379',
        auth: 'pass1',
        scope: INTERCOM_SCOPE.STRATEGY
    },
    LOCALHOST_UI: {
        host: '127.0.0.1',
        port: '6379',
        auth: 'pass1',
        scope: INTERCOM_SCOPE.UI
    }
};
