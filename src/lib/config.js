const path = require('path');
const fs = require('fs');

const configPath = path.join(process.cwd(), 'config', 'testConfig.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const getTestConfig = () => {
    return testConfig;
}

const getRedisOptions = () => {
    return testConfig.redisOptions;
}

const getMultiSchemeTestTtkEnvFileList = () => {
    return getMultiSchemeTestConfig().map((config) => config.ttkEnvFile);
}

const getMultiSchemeTestConfig = () => {
    const multiSchemeTestConfig = [];
    
    for (const source in testConfig.multiSchemeConfig) {
        if (!testConfig.dfspConfig[source]?.enabled) continue; // Skip if source DFSP is not enabled
    
        for (const target in testConfig.multiSchemeConfig[source].targets) {
            if (!testConfig.dfspConfig[target]?.enabled) continue; // Skip if target DFSP is not enabled
    
            multiSchemeTestConfig.push({
                sourceDfspId: source,
                targetDfspId: target,
                sendAmount: testConfig.multiSchemeConfig[source].targets[target].sendAmount,
                happyPathMSISDN: testConfig.multiSchemeConfig[source].targets[target].happyPathMSISDN,
                currency: testConfig.multiSchemeConfig[source].targets[target].currency,
                endpoint: testConfig.multiSchemeConfig[source].targets[target].endpoint,
                ttkEnvFile: `multi_scheme_${source}_to_${target}.json`
            });
        }
    }
    return multiSchemeTestConfig;
}

const getPerSchemeTestConfig = () => {
    const perSchemeTestConfig = [];
    
    for (const source in testConfig.dfspConfig) {
        if (!testConfig.dfspConfig[source]?.enabled) continue; // Skip if source DFSP is not enabled
        perSchemeTestConfig.push({
            sourceDfspId: source,
            ttkEnvFile: `per_scheme_${source}.json`
        });
    }
    return perSchemeTestConfig;
}

module.exports = {
    getTestConfig,
    getRedisOptions,
    getMultiSchemeTestConfig,
    getPerSchemeTestConfig,
    getMultiSchemeTestTtkEnvFileList
};