Ext.define('FileManagement.components.utils.NotificationUtil', {
    singleton: true,
    alternateClassName: 'NotificationUtil',

    requires: [
        'Ext.window.Toast'
    ],

    scanningToasts: {},

    showSuccess: function(message, title = 'Success') {
        return Ext.toast({
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
        });
    },

    showError: function(message, title = 'Error') {
        return Ext.toast({
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
        });
    },

    showWarning: function(message, title = 'Warning') {
        return Ext.toast({
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
        });
    },

    showScanningNotification: function(filename) {
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

    showScanResultNotification: function(filename, isInfected) {
        if (isInfected) {
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
        } else {
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
        if (this.scanningToasts[filename]) {
            Ext.defer(() => {
                if (this.scanningToasts[filename]) {
                    this.scanningToasts[filename].close();
                    delete this.scanningToasts[filename];
                }
            }, 1000);
        }

        // Refresh the file grid store
        const fileGrid = Ext.ComponentQuery.query('filegrid')[0];
        if (fileGrid && fileGrid.getStore()) {
            fileGrid.getStore().reload();
        }
    }
});
