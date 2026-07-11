// Portland, OR as default center — fallback if geolocation is denied
const DEFAULT_LAT = 45.5152;
const DEFAULT_LNG = -122.6784;
const DEFAULT_ZOOM = 13;

document.addEventListener('alpine:init', () => {
    Alpine.data('mapView', () => ({
        games: [],
        filteredGames: [],
        search: '',
        loading: true,
        highlightedGame: null,
        map: null,
        markers: {},

        async init() {
            requireAuth();

            this.map = L.map('map').setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(this.map);

            await this.loadGames();

            this.$watch('search', () => this.filterGames());
        },

        async loadGames() {
            this.loading = true;
            try {
                const data = await api.games.list();
                this.games = data.games || [];
                this.filteredGames = this.games;
                this.addMarkers();
            } catch (err) {
                console.error('Failed to load games:', err);
            } finally {
                this.loading = false;
            }
        },

        async useMyLocation() {
            if (!navigator.geolocation) return;

            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    this.map.setView([latitude, longitude], DEFAULT_ZOOM);

                    this.loading = true;
                    try {
                        const data = await api.games.list({
                            lat: latitude,
                            lng: longitude,
                            radius: 10,
                        });
                        this.games = data.games || [];
                        this.filteredGames = this.games;
                        this.addMarkers();
                    } catch (err) {
                        console.error('Failed to load nearby games:', err);
                    } finally {
                        this.loading = false;
                    }
                },
                () => {
                    console.log('Geolocation denied, using default location');
                }
            );
        },

        addMarkers() {
            // Always clear before re-adding to prevent marker leaks
            this.clearMarkers();

            this.games.forEach((game) => {
                // Fix: use == null instead of falsy check so lat/lng of 0 is valid
                const lat = game.location_lat;
                const lng = game.location_lng;

                if (lat == null || lng == null) return;

                const icon = L.divIcon({
                    className: '',
                    html: `<div style="background:#1A1AE6;color:white;border-radius:50% 50% 50% 0;width:32px;height:32px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);font-size:14px;">⚽</span></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -32],
                });

                const marker = L.marker([lat, lng], { icon }).addTo(this.map);

                // Fix: use textContent not innerHTML to prevent XSS from user-supplied content
                const popupContent = document.createElement('div');
                popupContent.style.minWidth = '180px';
                popupContent.style.fontFamily = 'Inter, sans-serif';

                const title = document.createElement('div');
                title.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:4px;';
                title.textContent = game.description || 'Pickup Game';

                const date = document.createElement('div');
                date.style.cssText = 'font-size:12px;color:#6B6B6B;margin-bottom:8px;';
                date.textContent = this.formatDate(game.starts_at);

                const link = document.createElement('a');
                link.href = `/pages/game.html?id=${game.id}`;
                link.textContent = 'View Game';
                link.style.cssText = 'display:block;background:#1A1AE6;color:white;text-align:center;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;';

                popupContent.appendChild(title);
                popupContent.appendChild(date);
                popupContent.appendChild(link);

                marker.bindPopup(L.popup({ interactive: true }).setContent(popupContent));

                marker.on('mouseover', () => { this.highlightedGame = game.id; });
                marker.on('mouseout', () => { this.highlightedGame = null; });

                this.markers[game.id] = marker;
            });

            if (Object.keys(this.markers).length > 0) {
                const group = L.featureGroup(Object.values(this.markers));
                this.map.fitBounds(group.getBounds().pad(0.2));
            }
        },

        clearMarkers() {
            Object.values(this.markers).forEach((m) => m.remove());
            this.markers = {};
        },

        highlightPin(gameId) {
            this.highlightedGame = gameId;
            if (gameId && this.markers[gameId]) {
                this.markers[gameId].openPopup();
            }
        },

        filterGames() {
            if (!this.search) {
                this.filteredGames = this.games;
                return;
            }
            const q = this.search.toLowerCase();
            this.filteredGames = this.games.filter(
                (g) =>
                    (g.description && g.description.toLowerCase().includes(q)) ||
                    (g.display_location && g.display_location.toLowerCase().includes(q)) ||
                    (g.location_name && g.location_name.toLowerCase().includes(q))
            );
        },

        openGame(id) {
            window.location.href = `/pages/game.html?id=${id}`;
        },

        formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        },

        async logout() {
            await handleLogout();
        },
    }));
});