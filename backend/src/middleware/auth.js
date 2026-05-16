const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const premiumMiddleware = (req, res, next) => {
  if (!req.user.is_premium) {
    return res.status(403).json({ success: false, message: 'Premium required' });
  }
  next();
};

module.exports = { authMiddleware, premiumMiddleware };
