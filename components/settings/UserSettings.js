Ext.define('FileManagement.components.settings.UserSettings', {
    singleton: true,

    requires: [
        'FileManagement.helpers.Functions'
    ],

    defaults: {
        account: {
            rememberMeDefault: false
        },
        sharing: {
            defaultPermission: 'download',
            defaultExpiryMinutes: null,
            directLinkEnabled: true,
            directLinkPermission: 'download',
            directLinkExpiryMinutes: null
        },
        uploads: {
            autoResumeInterrupted: true,
            showRecoveryPanel: true,
            showUploadPanel: true
        },
        scanning: {
            showScanPanel: true,
            notifyOnComplete: true,
            scanSharedBeforeOpen: true
        },
        conversions: {
            pdfPreserveLayout: true,
            previewDpi: 144,
            mediaQuality: 'balanced',
            gifQuality: 'balanced'
        },
        workspace: {
            reopenLastPanels: false,
            enablePanelAnimations: true,
            dimInactivePanels: true,
            mobileNavAutoClose: true
        },
        notifications: {
            uploads: true,
            shares: true,
            scans: true,
            conversions: true,
            downloads: false
        }
    },

    user: null,
    settings: null,
    loading: false,
    loadCallbacks: null,
    loginRememberStorageKey: 'fileManagement.rememberMeDefault',

    clone: function(value) {
        return Ext.decode(Ext.encode(value));
    },

    mergeDefaults: function(settings) {
        return Ext.merge(this.clone(this.defaults), settings || {});
    },

    getStorageKey: function() {
        const userId = FileManagement.helpers.Functions.getUserId() || 'anonymous';
        return `fileManagementUserSettings:${userId}`;
    },

    loadFromStorage: function() {
        try {
            const raw = localStorage.getItem(this.getStorageKey());
            return raw ? this.mergeDefaults(Ext.decode(raw, true) || {}) : this.clone(this.defaults);
        } catch (error) {
            return this.clone(this.defaults);
        }
    },

    persistToStorage: function(settings) {
        try {
            localStorage.setItem(this.getStorageKey(), Ext.encode(settings || this.settings || this.defaults));
        } catch (error) {
            // Browser storage may be unavailable; server settings remain the source of truth.
        }
    },

    getLoginRememberDefault: function() {
        try {
            const stored = localStorage.getItem(this.loginRememberStorageKey);
            if (stored !== null) {
                return stored === 'true';
            }
        } catch (error) {
            // Fall back to the per-user settings cache below.
        }

        return this.get('account.rememberMeDefault', false) === true;
    },

    setLoginRememberDefault: function(value) {
        try {
            localStorage.setItem(this.loginRememberStorageKey, value === true ? 'true' : 'false');
        } catch (error) {
            // Browser storage can be unavailable in restricted contexts.
        }
    },

    syncLoginRememberDefault: function(settings) {
        const rememberDefault = settings &&
            settings.account &&
            settings.account.rememberMeDefault === true;

        this.setLoginRememberDefault(rememberDefault);
    },

    getSettings: function() {
        if (!this.settings) {
            this.settings = this.loadFromStorage();
        }

        return this.settings;
    },

    get: function(path, fallback) {
        const parts = String(path || '').split('.');
        let value = this.getSettings();

        for (let index = 0; index < parts.length; index += 1) {
            if (!value || !Object.prototype.hasOwnProperty.call(value, parts[index])) {
                return fallback;
            }

            value = value[parts[index]];
        }

        return value === undefined ? fallback : value;
    },

    isEnabled: function(path, fallback) {
        return this.get(path, fallback) !== false;
    },

    normalizeNotificationCategory: function(category) {
        const normalized = String(category || '').toLowerCase();
        const aliases = {
            upload: 'uploads',
            uploads: 'uploads',
            share: 'shares',
            shares: 'shares',
            link: 'shares',
            links: 'shares',
            scan: 'scans',
            scans: 'scans',
            security: 'scans',
            conversion: 'conversions',
            conversions: 'conversions',
            media: 'conversions',
            document: 'conversions',
            download: 'downloads',
            downloads: 'downloads'
        };

        return aliases[normalized] || null;
    },

    shouldNotify: function(category, fallback) {
        const normalized = this.normalizeNotificationCategory(category);
        if (!normalized) {
            return fallback !== false;
        }

        return this.get(`notifications.${normalized}`, fallback !== false) !== false;
    },

    setLocal: function(user, settings) {
        this.user = user || this.user;
        this.settings = this.mergeDefaults(settings || (user && user.settings) || {});
        this.persistToStorage(this.settings);
        this.syncLoginRememberDefault(this.settings);

        if (user && user.username) {
            const storage = FileManagement.helpers.Functions.getAuthStorage();
            storage.setItem('username', user.username);
        }

        if (Ext.GlobalEvents) {
            Ext.GlobalEvents.fireEvent('usersettingschanged', this.settings, this.user);
        }

        return this.settings;
    },

    load: function(callback, force) {
        const token = FileManagement.helpers.Functions.getToken();

        if (!token) {
            const settings = this.getSettings();
            if (callback) callback(settings, this.user);
            return;
        }

        if (this.loading) {
            this.loadCallbacks = this.loadCallbacks || [];
            if (callback) this.loadCallbacks.push(callback);
            return;
        }

        if (this.settings && !force) {
            if (callback) callback(this.settings, this.user);
            return;
        }

        this.loading = true;
        this.loadCallbacks = callback ? [callback] : [];

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/me'),
            method: 'GET',
            headers: {
                Authorization: FileManagement.helpers.Functions.getAuthorizationHeader()
            },
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                const user = payload.user || {};
                const settings = this.setLocal(user, user.settings || payload.settings || {});
                this.finishLoading(settings, user);
            },
            failure: () => {
                this.finishLoading(this.getSettings(), this.user);
            }
        });
    },

    finishLoading: function(settings, user) {
        const callbacks = this.loadCallbacks || [];
        this.loading = false;
        this.loadCallbacks = [];

        callbacks.forEach(function(callback) {
            callback(settings, user);
        });
    },

    saveSettings: function(settings, callback) {
        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/settings'),
            method: 'PUT',
            headers: {
                Authorization: FileManagement.helpers.Functions.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            jsonData: {
                settings: settings
            },
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                const savedSettings = this.setLocal(this.user, payload.settings || settings);
                if (callback) callback(true, savedSettings, payload);
            },
            failure: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                if (callback) callback(false, null, payload);
            }
        });
    },

    updateProfile: function(profile, callback) {
        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/profile'),
            method: 'PUT',
            headers: {
                Authorization: FileManagement.helpers.Functions.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            jsonData: profile,
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                const user = payload.user || {};
                this.setLocal(user, user.settings || this.settings);
                if (callback) callback(true, user, payload);
            },
            failure: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                if (callback) callback(false, null, payload);
            }
        });
    },

    changePassword: function(passwords, callback) {
        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/password'),
            method: 'PUT',
            headers: {
                Authorization: FileManagement.helpers.Functions.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            jsonData: passwords,
            success: (response) => {
                if (callback) callback(true, Ext.decode(response.responseText, true) || {});
            },
            failure: (response) => {
                if (callback) callback(false, Ext.decode(response.responseText, true) || {});
            }
        });
    },

    logoutAllSessions: function(callback) {
        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/auth/logout-all'),
            method: 'POST',
            headers: {
                Authorization: FileManagement.helpers.Functions.getAuthorizationHeader()
            },
            callback: function(options, success, response) {
                const payload = response && response.responseText ? Ext.decode(response.responseText, true) || {} : {};
                if (callback) callback(success, payload);
            }
        });
    }
});
