document.addEventListener('alpine:init', () => {
    Alpine.data('gameDetail', () => ({
        game: null,
        loading: true,
        submitting: false,
        error: '',
        success: '',
        isInGame: false,
        isHost: false,

        get host() {
            if (!this.game || !this.game.players) return null;
            return this.game.players.find((p) => p.role === 'host') || null;
        },

        async init() {
            requireAuth();

            const params = new URLSearchParams(window.location.search);
            const id = params.get('id');

            if (!id) {
                this.loading = false;
                return;
            }

            await this.loadGame(id);
        },

        async loadGame(id) {
            this.loading = true;
            try {
                const data = await api.games.get(id);
                this.game = data.game;
                this.checkPlayerStatus();
            } catch (err) {
                this.game = null;
            } finally {
                this.loading = false;
            }
        },

        checkPlayerStatus() {
            // Always reset first — prevents stale UI state after leave/join
            this.isInGame = false;
            this.isHost = false;

            const user = getUser();
            if (!user || !this.game || !this.game.players) return;

            const playerRecord = this.game.players.find((p) => p.id === user.id);
            if (playerRecord) {
                this.isInGame = true;
                this.isHost = playerRecord.role === 'host';
            }
        },

        async joinGame() {
            this.error = '';
            this.success = '';
            this.submitting = true;
            try {
                const result = await api.games.join(this.game.id);
                this.success = result.role === 'waitlist'
                    ? 'Added to waitlist — you will be promoted if a spot opens'
                    : 'You joined the game!';
                await this.loadGame(this.game.id);
            } catch (err) {
                this.error = err.message || 'Could not join game';
            } finally {
                this.submitting = false;
            }
        },

        async leaveGame() {
            this.error = '';
            this.success = '';
            this.submitting = true;
            try {
                await api.games.leave(this.game.id);
                this.success = 'You left the game';
                await this.loadGame(this.game.id);
            } catch (err) {
                this.error = err.message || 'Could not leave game';
            } finally {
                this.submitting = false;
            }
        },

        getPlayerInitials(player) {
            if (!player) return '?';
            if (player.full_name) {
                return player.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
            }
            return player.username.slice(0, 2).toUpperCase();
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        },

        capitalize(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        },
    }));
});