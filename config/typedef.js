/** const values */
EXCHANGE = {
    BINANCEU: "BinanceU"
}

CONTRACT_TYPE = {
    PERP: "perp"
}

ORDER_TYPE = {
    LIMIT: "limit",
    MARKET: "market"
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
    EXECUTED: "executed",
    EXPIRED: "expired",
    LIQUIDATED: "liquidated"
}

ORDER_STATUS = {
    SUBMITTED: "new",
    CANCELLED: "cancelled",
    FILLED: "filled",
    PARTIALLY_FILLED: "partially_filled"
}

MARKET_DATA = {
    ORDERBOOK: "orderbook",
    QUOTE: "quote",
    TRADE: "trade",
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

REQUEST_ACTIONS = {
    SEND_ORDER: 'place_order',
    CANCEL_ORDER: 'cancel_order',
    INSPECT_ORDER: 'inspect_order',
    INSPECT_ORDER_BATCH: 'inspect_order_batch',
    CANCEL_ALL_ORDER: 'cancel_all_orders',
    MODIFY_ORDER: 'modify_order',
    QUERY_POSITION: 'query_position',
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

INTERCOM_SCOPE = {
    FEED: "feed",
    STRATEGY: "strategy"
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
    }
};
