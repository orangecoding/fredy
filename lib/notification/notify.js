const fs = require('fs');
const path = './adapter';

/** Read every integration existing in ./adapter **/
const adapter = fs
    .readdirSync('./lib/notification/adapter')
    .map(integPath => require(`${path}/${integPath}`))
    .filter(integration => integration.enabled());

if (adapter.length === 0) {
    throw new Error('Please specify at least one notification provider');
}

exports.send = (serviceName, payload) => {
    //this is not being used in tests, therefor adapter are always set
    return adapter.map(a => a.send(serviceName, payload));
};
