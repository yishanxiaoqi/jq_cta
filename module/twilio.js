// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const moment = require("moment");
const logger = require("../module/logger.js");
const token = require("../config/token.json");
const twilio = require("twilio");

class Twilio {
    constructor() {
        this.account = token.twilio.account;
        this.token = token.twilio.token;
        this.last_call_ts = undefined;
        this.client = twilio(this.account, this.token, {lazyLoading: false});
    }

    async call() {
        if ((this.last_call_ts !== undefined) && (moment(new Date()).diff(this.last_call_ts, "second") < 60 * 30)) {
            // 半小时内最多打一次电话
            logger.info("Call only once within a period of half an hour!");
            return;
        }
        
        try {
            // Call the chat.postMessage method using the built-in WebClient
            const call = await this.client.calls.create({
                from: token.twilio.twilioNumber,
                to: token.twilio.myNumber,
                url: "http://demo.twilio.com/docs/voice.xml",
            });

            logger.info(`Made a call to ${token.twilio.myNumber}!`)
        } catch (error) {
            logger.error(`Twilio error: ${error}`);
        }

        this.last_call_ts = moment(new Date());
    }
}

module.exports = {
    Twilio: Twilio
};