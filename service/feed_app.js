require("../config/typedef.js");
const Slack = require("../module/slack");
const BinanceU = require("../exchange/exchange_binanceU.js");
const OKX = require("../exchange/exchange_okx.js");

const logger = require("../module/logger.js");
const Intercom = require("../module/intercom");

class FeedApp {
    constructor(intercom) {
        this.name = "FeedApp";
        this.intercom = intercom;
        this.slack = new Slack.Slack();

        this.on_slack_publish_handler = this.on_slack_publish.bind(this);
    }

    on_slack_publish(slack_publish) {
        // logger.info(`${this.name}: slack publish message: ${JSON.stringify(slack_publish)}`);
        let type = slack_publish["type"];
        let msg = slack_publish["msg"];

        switch (type) {
            case "info":
                this.slack.info(msg);
                break;
            case "warn":
                this.slack.warn(msg);
                break;
            case "alert":
                this.slack.alert(msg);
                break;
        }
    }

    _register_events() {
        this.intercom.on("SLACK_PUBLISH", this.on_slack_publish_handler, INTERCOM_SCOPE.STRATEGY);
    }

    start() {
        this._register_events();
        let bn = new BinanceU("BinanceU", this.intercom);
        // let ok = new OKX("OKX", this.intercom);

        bn.start();
        // ok.start();
    }
}

module.exports = FeedApp;

var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var feed_app = new FeedApp(new Intercom(intercom_config));
feed_app.start();

process.on('SIGINT', async () => {
    logger.info("Feed::SIGINT");
    setTimeout(() => process.exit(), 3000)
});

process.on('exit', async () => {
    logger.info("Feed:: exit");
});

process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${JSON.stringify(err.stack)}`);
});

process.on('unhandledRejection', (reason, p) => {
    logger.error(`unhandledRejection: ${p}, reason: ${reason}`);
});