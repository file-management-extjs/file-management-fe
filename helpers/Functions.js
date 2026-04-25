// Helper to retrieve Bearer token
Ext.define('FileManagement.helpers.Functions', {
    singleton: true,

    authKeys: ['token', 'username', 'userId'],
    logoutEventKey: 'fileManagementLogoutEvent',
    sessionExpiredHandled: false,

    getAuthStorage: function() {
        return sessionStorage.getItem('token') ? sessionStorage : localStorage;
    },

    getToken: function () {
        return sessionStorage.getItem('token') || localStorage.getItem('token');
    },

    getUsername: function() {
        return sessionStorage.getItem('username') || localStorage.getItem('username');
    },

    getUserId: function() {
        return sessionStorage.getItem('userId') || localStorage.getItem('userId');
    },

    storeAuthSession: function(authData, rememberMe) {
        const storage = rememberMe ? localStorage : sessionStorage;

        this.clearAuthSession();
        storage.setItem('token', authData.token);
        storage.setItem('username', authData.username);
        storage.setItem('userId', authData.userId);
    },

    clearAuthSession: function() {
        this.authKeys.forEach(function(key) {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    },

    getAuthorizationHeader: function() {
        const token = this.getToken();
        return token ? `Bearer ${token}` : '';
    },

    isAuthFailure: function(status, responseText) {
        if (status !== 401) {
            return false;
        }

        if (!responseText) {
            return true;
        }

        try {
            const payload = Ext.decode(responseText, true) || {};
            const tokenCodes = ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_INVALIDATED', 'TOKEN_MISSING', 'TOKEN_MALFORMED'];
            const tokenErrors = ['Session expired', 'Session was logged out', 'No token provided', 'Token is malformed', 'Failed to authenticate token'];

            return tokenCodes.indexOf(payload.code) !== -1 || tokenErrors.indexOf(payload.error) !== -1;
        } catch (error) {
            return true;
        }
    },

    broadcastLogout: function(reason) {
        try {
            localStorage.setItem(this.logoutEventKey, Ext.encode({
                reason: reason || 'logout',
                timestamp: Date.now()
            }));
        } catch (error) {
            // Storage can be unavailable in private/browser-restricted contexts.
        }
    },

    handleSessionExpired: function(message, options) {
        if (this.sessionExpiredHandled) {
            return;
        }

        options = options || {};
        this.sessionExpiredHandled = true;
        this.clearAuthSession();

        Ext.Ajax.setDefaultHeaders({
            Authorization: ''
        });

        if (options.broadcast !== false) {
            this.broadcastLogout(options.reason || 'session-ended');
        }

        const reload = function() {
            window.location.reload();
        };

        if (Ext.Msg && Ext.Msg.alert) {
            Ext.Msg.alert(options.title || 'Session Expired', message || 'Your session expired. Please log in again.', reload);
            return;
        }

        reload();
    },

    logout: function() {
        const token = this.getToken();
        const me = this;
        const finish = function() {
            me.handleSessionExpired('You have been logged out.', {
                title: 'Logged Out',
                reason: 'logout'
            });
        };

        if (!token) {
            finish();
            return;
        }

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/logout'),
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            },
            callback: finish
        });
    },

    installAuthFailureHandlers: function() {
        const me = this;

        if (!me.ajaxAuthFailureHandlerInstalled && Ext.Ajax) {
            me.ajaxAuthFailureHandlerInstalled = true;
            Ext.Ajax.on('requestexception', function(connection, response) {
                if (me.isAuthFailure(response.status, response.responseText)) {
                    me.handleSessionExpired();
                }
            });
        }

        if (!me.storageAuthFailureHandlerInstalled && window.addEventListener) {
            me.storageAuthFailureHandlerInstalled = true;
            window.addEventListener('storage', function(event) {
                if (event.key === me.logoutEventKey && event.newValue) {
                    me.handleSessionExpired('You were logged out in another tab.', {
                        title: 'Logged Out',
                        reason: 'external-logout',
                        broadcast: false
                    });
                }
            });
        }

        if (!me.fetchAuthFailureHandlerInstalled && window.fetch) {
            me.fetchAuthFailureHandlerInstalled = true;
            const originalFetch = window.fetch.bind(window);

            window.fetch = function() {
                return originalFetch.apply(window, arguments).then(function(response) {
                    if (response && response.status === 401) {
                        response.clone().text().then(function(responseText) {
                            if (me.isAuthFailure(response.status, responseText)) {
                                me.handleSessionExpired();
                            }
                        }).catch(function() {
                            me.handleSessionExpired();
                        });
                    }

                    return response;
                });
            };
        }
    }
});
