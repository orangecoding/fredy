const fs = require('fs');
const path = './lib/provider';
const provider = fs.readdirSync(path);
const config = require('./conf/config.json');
const FredyRuntime = require('./lib/FredyRuntime');

setInterval(
    (function exec() {
        Object.keys(config.jobs).forEach(jobKey => {
            const jobConfig = config.jobs[jobKey];
            provider
                .map(pro => require(`${path}/${pro}`))
                .forEach(pro => {
                    const providerId = pro.id();
                    if (providerId == null || providerId.length === 0) {
                        throw new Error('Provider id must not be empty. => ' + pro);
                    }
                    const providerConfig = jobConfig.provider[providerId];
                    if (providerConfig == null) {
                        throw new Error("Provider Config for provider with id " + providerId + " not found.");
                    }
                    pro.init(providerConfig, jobConfig.blacklist, jobConfig.blacklistedDistricts);
                    new FredyRuntime(pro.config, jobConfig.notification, providerId, jobKey)
                        .execute();
                })

        });
        return exec;
    })(),
    config.interval * 60 * 1000
);
