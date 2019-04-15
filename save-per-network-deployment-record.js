/**
 * Saves _NETOWRK_ID_._CONTRACT_.json file
 * when deploying to non-transient networks.
 * or `Hello, ${name}` when running `truffle run hello [name]`
 * @param {Config} config - A truffle-config object.
 * Has attributes like `truffle_directory`, `working_directory`, etc.
 * @param {(done|callback)} [done=done] - A done callback, or a normal callback.
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const mkdirp = require('mkdirp');

module.exports = (config, done) => {
  if (!config.network) {
    if (config.networks.development) {
      config.network = 'development';
    } else {
      throw new Error('config.network not set _AND_ config.networks.development not valid');
    }
  }
  if (!config.network_id) {
    throw new Error(`Invalid config.network_id: ${config.network_id}. Check 'truffle-config.js or --network option'`);
  }
  // read config file `transient-networks.jsonc`, format:
  // ```
  // {
  //   "truffle-develop": { "network_id": "5777" },
  // }
  // ```
  const s0 = fs.readFileSync('transient-networks.jsonc', {encoding: 'utf8'});
  const transientNetworkConfig = JSON5.parse(s0);
  const transientNetworks = new Set(); // set of networkIds
  for (const i in transientNetworkConfig) {
    transientNetworks.add(transientNetworkConfig[i]['network_id']);
  }
  // config.network_id can be '*', e.g. when config.network === 'development'
  transientNetworks.add('*');
  // Promise returned by web3.eth.net.getId() would not resolve before "truffle run" terminates,
  // so not using it here.
  // Instead the user must specify a non-'*' network_id in `truffle-config.js` for the selected network.
  const deployedNetworkId = config.network_id;

  // save record if deploying to non-transient network
  if (!transientNetworks.has(deployedNetworkId)) {
    const inD = path.join('build', 'contracts');
    const contractsDirContents = fs.readdirSync(inD);
    const outD = 'contracts-deployed-to-production';
    mkdirp.sync(outD);
    const linkDir = config['create-symlink-without-network-id-prefix'];
    for (const inName of contractsDirContents) {
      if (typeof(inName) != 'string' || !inName.endsWith('.json')) {
        continue;
      }
      const outName = `${deployedNetworkId}-${inName}`;
      const inP = path.join(inD, inName);
      const outP = path.join(outD, outName);
      const d = JSON.parse(fs.readFileSync(inP, {encoding: 'utf8'}));
      const n = d['networks'];

      for (const j in n) {
        // Leave all non-transient networks for front-end app consumption
        // even if those networks are not the one we're deploying to.
        if (transientNetworks.has(j)) {
          delete n[j];
        }
      }
      if (Object.entries(n).length === 0) {
        console.log(`Deploying to network "${deployedNetworkId}" but "${outName}" has empty "networks" attribute. Not writing deployment record.`);
      } else {
        d['networks'] = n;
        const outStr = JSON.stringify(d, null, '  ') + '\n';
        console.log(`writing ${outP}`);
        fs.writeFileSync(outP, outStr, { encoding: 'utf-8' });
      }
      if (linkDir) {
        mkdirp.sync(linkDir);
        const inLinkP = outP;
        const outLinkP = path.join(linkDir, inName);
        try {
          console.log(`hard-linking ${inLinkP} ${outLinkP}`);
          fs.linkSync(inLinkP, outLinkP);
        } catch (err) {
          if (err.code === 'EEXIST') {
            fs.unlinkSync(outLinkP);
            console.log(`hard-linking ${inLinkP} ${outLinkP}`);
            fs.linkSync(inLinkP, outLinkP);
          }
        }
      }
    }
  }
  done();
}
