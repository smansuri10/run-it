// ─── API Configuration ─────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';

/**
 * Core fetch wrapper.
 * Handles auth headers, JSON parsing, and error normalization.
 */
const request = async (method, path, body = null) => {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // sends httpOnly refresh cookie automatically
    };

    // Attach access token if we have one
    const token = localStorage.getItem('accessToken');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();

    if (!res.ok) {
        const error = new Error(data.error || 'Something went wrong');
        error.status = res.status;
        error.data = data;
        throw error;
    }

    return data;
};

// ─── Auth ──────────────────────────────────────────────────────────────────
const api = {
    auth: {
        register: (body) => request('POST', '/auth/register', body),
        login: (body) => request('POST', '/auth/login', body),
        refresh: () => request('POST', '/auth/refresh'),
        logout: () => request('POST', '/auth/logout'),
    },

    // ─── Games ──────────────────────────────────────────────────────────────
    games: {
        list: (params = {}) => {
            const query = new URLSearchParams(
                Object.fromEntries(
                    Object.entries(params).filter(([, v]) => v !== undefined)
                )
            ).toString();
            return request('GET', `/games${query ? '?' + query : ''}`);
        },
        get: (id) => request('GET', `/games/${id}`),
        create: (body) => request('POST', '/games', body),
        join: (id) => request('POST', `/games/${id}/join`),
        leave: (id) => request('DELETE', `/games/${id}/join`),
    },
};