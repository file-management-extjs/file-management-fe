Ext.define('FileManagement.components.utils.NotificationUtil', {
    singleton: true,
    alternateClassName: 'NotificationUtil',

    requires: [
        'Ext.window.Toast',
        'FileManagement.components.settings.UserSettings'
    ],

    scanningToasts: {},

    inferNotificationCategory: function(category, title, message) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        if (settings && settings.normalizeNotificationCategory) {
            const explicit = settings.normalizeNotificationCategory(category);
            if (explicit) {
                return explicit;
            }
        }

        const value = `${title || ''} ${message || ''}`.toLowerCase();

        if (value.indexOf('upload') !== -1) {
            return 'uploads';
        }

        if (value.indexOf('share') !== -1 || value.indexOf('direct link') !== -1 || value.indexOf('shared with you') !== -1) {
            return 'shares';
        }

        if (value.indexOf('scan') !== -1 || value.indexOf('virus') !== -1 || value.indexOf('security') !== -1) {
            return 'scans';
        }

        if (value.indexOf('conversion') !== -1 || value.indexOf('converting') !== -1) {
            return 'conversions';
        }

        if (value.indexOf('download') !== -1) {
            return 'downloads';
        }

        return null;
    },

    shouldShowNotification: function(category, title, message, options) {
        if (options && options.ignoreUserSettings === true) {
            return true;
        }

        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        const normalized = this.inferNotificationCategory(category, title, message);

        return !normalized || !settings || !settings.shouldNotify || settings.shouldNotify(normalized, true);
    },

    toast: function(config, options) {
        options = options || {};

        if (!this.shouldShowNotification(options.category, config.title, config.html, options)) {
            return null;
        }

        return Ext.toast(config);
    },

    showSuccess: function(message, title = 'Success', options = null) {
        return this.toast({
            html: message,
            title: title,
            width: 300,
            align: 'tr',
            iconCls: 'fa fa-check-circle',
            cls: 'success-toast',
            slideInDuration: 200,
            slideBackDuration: 200,
            autoClose: true,
            minWidth: 200,
            closable: true,
            timeout: 3000
        }, options);
    },

    showError: function(message, title = 'Error', options = null) {
        return this.toast({
            html: message,
            title: title,
            width: 300,
            align: 'tr',
            iconCls: 'fa fa-times-circle',
            cls: 'error-toast',
            slideInDuration: 200,
            slideBackDuration: 200,
            autoClose: true,
            minWidth: 200,
            closable: true,
            timeout: 5000
        }, options);
    },

    showWarning: function(message, title = 'Warning', options = null) {
        return this.toast({
            html: message,
            title: title,
            width: 300,
            align: 'tr',
            iconCls: 'fa fa-exclamation-triangle',
            cls: 'warning-toast',
            slideInDuration: 200,
            slideBackDuration: 200,
            autoClose: true,
            minWidth: 200,
            closable: true,
            timeout: 4000
        }, options);
    },

    showInfo: function(message, title = 'Info', options = null) {
        return this.toast({
            html: message,
            title: title,
            width: 300,
            align: 'tr',
            iconCls: 'fa fa-info-circle',
            cls: 'info-toast',
            slideInDuration: 200,
            slideBackDuration: 200,
            autoClose: true,
            minWidth: 200,
            closable: true,
            timeout: 3500
        }, options);
    },

    showScanningNotification: function(filename) {
        if (!this.shouldShowNotification('scans', 'Virus Scan', filename)) {
            return null;
        }

        // Only create scanning toast if it doesn't exist
        if (!this.scanningToasts[filename]) {
            const toast = Ext.toast({
                html: `Scanning file: ${filename}...`,
                title: 'Virus Scan',
                width: 300,
                align: 'tr',
                iconCls: 'fa fa-shield',
                slideInDuration: 200,
                slideBackDuration: 200,
                autoClose: false,
                minWidth: 200,
                closable: true,
                listeners: {
                    close: () => {
                        delete this.scanningToasts[filename];
                    }
                }
            });
            this.scanningToasts[filename] = toast;
        }
    },

    closeScanningNotification: function(filename) {
        if (this.scanningToasts[filename]) {
            Ext.defer(() => {
                if (this.scanningToasts[filename]) {
                    this.scanningToasts[filename].close();
                    delete this.scanningToasts[filename];
                }
            }, 1000);
        }
    },

    showScanResultNotification: function(filename, isInfected, options = null) {
        const shouldNotify = !(options && options.suppressToast === true) &&
            this.shouldShowNotification('scans', isInfected ? 'Security Alert' : 'Virus Scan Complete', filename);

        if (shouldNotify && isInfected) {
            Ext.toast({
                html: `Warning: Virus detected in "${filename}". File has been deleted.`,
                title: 'Security Alert',
                width: 300,
                align: 'tr',
                iconCls: 'fa fa-exclamation-triangle yellow-icon',
                slideInDuration: 200,
                slideBackDuration: 200,
                autoClose: false,
                minWidth: 200,
                timeout: 5000,
                closable: true
            });
        } else if (shouldNotify) {
            Ext.toast({
                html: `No viruses detected in "${filename}".`,
                title: 'Virus Scan Complete',
                width: 300,
                align: 'tr',
                iconCls: 'fa fa-shield-check green-icon',
                bodyStyle: 'background-color: #e8f5e9;',
                slideInDuration: 200,
                slideBackDuration: 200,
                autoClose: false,
                minWidth: 200,
                timeout: 5000,
                closable: true
            });
        }

        // Keep scanning toast visible for a moment before closing
        this.closeScanningNotification(filename);

        // Refresh the file grid store
        const fileGrid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
        if (fileGrid && fileGrid.getStore()) {
            fileGrid.getStore().reload();
        }
    }
});
