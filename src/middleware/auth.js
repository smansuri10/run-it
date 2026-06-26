const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Protects routes that require authentication.
 * Reads the JWT from the Authorization header.
 * Attaches the user to req.user if valid.
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        if (payload.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        const user = await userModel.findById(payload.sub);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Defensively strip sensitive fields regardless of what the model returns
        const { password_hash, deleted_at, ...safeUser } = user;
        req.user = safeUser;
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = { authenticate };