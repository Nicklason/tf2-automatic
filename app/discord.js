const Discord = require('discord.js');
const hookid = process.env.DISCORD_WEBHOOK_URl.split('/')[5];
const hooktoken = process.env.DISCORD_WEBHOOK_URl.split('/')[6];
const hook = new Discord.WebhookClient(hookid, hooktoken);

const log = require('lib/logger');

exports.sendHook = function(msg) {
    hook.send(msg).then((info) => {
        log.info('Discord webhook sent.'); // Prob not needed
    }).catch((err) => {
        log.warn('Failed to send discord webook: ', err);
    });
};