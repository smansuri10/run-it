require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Core middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
    cors({
        origin:
            process.env.NODE_ENV === 'production'
                ? process.env.CLIENT_ORIGIN
                : `http://localhost:${PORT}`,
        credentials: true,
    })
);

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static('public'));

// ─── Health check ──────────────────────────────────────────────────────────────
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');

app.get('/health', async (req, res) => {
    try {
        await db.raw('SELECT 1');
        res.json({
            status: 'ok',
            db: 'connected',
            env: process.env.NODE_ENV,
        });
    } catch (err) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/games', gamesRoutes);

// ─── Base route ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ message: 'Run It API' });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error:
            process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message,
    });
});

// ─── Start server ─────────────────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`[run-it] API running on port ${PORT} — ${process.env.NODE_ENV}`);
    });
}

module.exports = app;