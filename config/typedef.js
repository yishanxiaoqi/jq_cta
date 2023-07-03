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
    QUERY_ORDERS: "query_orders"
}