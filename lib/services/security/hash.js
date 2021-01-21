const crypto = require('crypto');

exports.hash = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
