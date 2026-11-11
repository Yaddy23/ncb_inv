const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' });

const generateNewSecret = () => crypto.randomBytes(32).toString('hex');

const revokeAllUserSessions = async () => {
  const result = await User.updateMany(
    {},
    {
      $set: { sessions: [] },
      $unset: { refreshToken: "", refreshTokenExpires: "" }
    }
  );
  return result.modifiedCount;
};

const rotateSecret = async () => {
  const newSecret = generateNewSecret();
  const oldSecret = process.env.JWT_SECRET;

  // Update .env file (in production, this would be done via Render dashboard / CI)
  // For script: just update process.env for current process
  process.env.JWT_SECRET = newSecret;

  // Revoke all sessions - forces re-login with new secret
  const revokedCount = await revokeAllUserSessions();

  console.log(`JWT_SECRET rotated. Revoked ${revokedCount} user sessions.`);
  console.log(`New secret: ${newSecret}`);
  console.log('IMPORTANT: Update JWT_SECRET in Render dashboard and redeploy!');

  return { newSecret, revokedCount, oldSecret };
};

if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => rotateSecret())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { generateNewSecret, revokeAllUserSessions, rotateSecret };