(function(root) {
    const runtimeEnv = root.FILE_MANAGEMENT_ENV || {};

    function trimTrailingSlash(value) {
        return String(value || '').trim().replace(/\/+$/, '');
    }

    function normalizePath(path) {
        const value = String(path || '');
        return value.charAt(0) === '/' ? value : `/${value}`;
    }

    function stripApiPrefix(path) {
        const normalized = normalizePath(path);

        if (normalized === '/api') {
            return '';
        }

        return normalized.indexOf('/api/') === 0 ? normalized.slice(4) : normalized;
    }

    root.FILE_MANAGEMENT_ENV = runtimeEnv;
    root.FileManagementEnv = {
        getApiBaseUrl: function() {
            return trimTrailingSlash(runtimeEnv.API_BASE_URL || '/api');
        },

        getSocketUrl: function() {
            const explicitSocketUrl = trimTrailingSlash(runtimeEnv.SOCKET_URL);
            if (explicitSocketUrl) {
                return explicitSocketUrl;
            }

            const apiBaseUrl = this.getApiBaseUrl();
            return apiBaseUrl.replace(/\/api$/, '') || root.location.origin;
        },

        apiUrl: function(path) {
            const apiBaseUrl = this.getApiBaseUrl();
            const apiPath = stripApiPrefix(path);

            return `${apiBaseUrl}${apiPath}`;
        },

        socketUrl: function() {
            return this.getSocketUrl();
        }
    };
}(typeof self !== 'undefined' ? self : window));
