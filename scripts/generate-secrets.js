const { randomBytes } = require('crypto');

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

if (require.main === module) {
  console.log(`JWT_SECRET=${generateSecret()}`);
  console.log(`JWT_REFRESH_SECRET=${generateSecret()}`);
}

module.exports = { generateSecret };
