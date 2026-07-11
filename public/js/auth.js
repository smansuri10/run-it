// ─── Token Management ──────────────────────────────────────────────────────

const setToken = (token) => localStorage.setItem('accessToken', token);
const getToken = () => localStorage.getItem('accessToken');
const clearToken = () => localStorage.removeItem('accessToken');

/**
 * Check if the user is logged in.
 * Returns true if an access token exists in localStorage.
 */
const isLoggedIn = () => !!getToken();

/**
 * Redirect to login if not authenticated.
 * Call this at the top of any protected page.
 */
const requireAuth = () => {
    if (!isLoggedIn()) {
        window.location.href = '/pages/login.html';
    }
};

/**
 * Redirect to map if already authenticated.
 * Call this on the login page so logged-in users skip it.
 */
const redirectIfLoggedIn = () => {
    if (isLoggedIn()) {
        window.location.href = '/pages/map.html';
    }
};

/**
 * Get the current user from localStorage.
 * Wrapped in try/catch — corrupted localStorage data won't break page load.
 */
const getUser = () => {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch {
        localStorage.removeItem('user');
        return null;
    }
};

/**
 * Save user to localStorage after login/register.
 */
const setUser = (user) => {
    localStorage.setItem('user', JSON.stringify(user));
};

/**
 * Clear all auth state — used on logout.
 */
const clearAuth = () => {
    clearToken();
    localStorage.removeItem('user');
};

/**
 * Handle login form submission.
 * Called by Alpine.js on the login page.
 */
const handleLogin = async (email, password) => {
    const data = await api.auth.login({ email, password });
    setToken(data.accessToken);
    setUser(data.user);
    window.location.href = '/pages/map.html';
};

/**
 * Handle register form submission.
 * Called by Alpine.js on the login page.
 */
const handleRegister = async (email, password, username, full_name) => {
    const data = await api.auth.register({ email, password, username, full_name });
    setToken(data.accessToken);
    setUser(data.user);
    window.location.href = '/pages/map.html';
};

/**
 * Handle logout.
 * Calls the API to clear the cookie, then clears local state.
 */
const handleLogout = async () => {
    try {
        await api.auth.logout();
    } catch (e) {
        // Clear local state regardless of API response
    } finally {
        clearAuth();
        window.location.href = '/pages/login.html';
    }
};

/**
 * Get initials from a full name or username for the avatar.
 */
const getInitials = (user) => {
    if (!user) return '?';
    if (user.full_name) {
        return user.full_name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }
    return user.username.slice(0, 2).toUpperCase();
};