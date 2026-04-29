Ext.define('FileManagement.components.utils.PrivateVaultManager', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.WorkspaceContext',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.utils.AccessTracker'
    ],

    requestJson: function(method, url, options = {}) {
        return new Promise((resolve, reject) => {
            Ext.Ajax.request({
                url,
                method,
                params: options.params || null,
                jsonData: options.jsonData || null,
                headers: {
                    'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader()
                },
                success: function(response) {
                    resolve(response.responseText ? Ext.decode(response.responseText, true) || {} : {});
                },
                failure: function(response) {
                    const payload = response.responseText ? Ext.decode(response.responseText, true) : null;
                    const error = new Error(payload && (payload.message || payload.error) || response.statusText || 'Private Vault request failed.');
                    error.status = response.status;
                    error.statusText = response.statusText;
                    error.responseText = response.responseText;
                    error.payload = payload || null;
                    error.code = payload && payload.code;
                    reject(error);
                }
            });
        });
    },

    getPersonalWorkspace: function() {
        const workspace = FileManagement.components.utils.WorkspaceContext.getActiveWorkspace();

        if (!workspace || workspace.type !== 'personal') {
            Ext.Msg.alert('Private Vault', 'Private Vault is available only in your Personal workspace.');
            return null;
        }

        return workspace;
    },

    getStatus: function(workspaceId) {
        return this.requestJson('GET', FileManagementEnv.apiUrl('/api/files/private-vault/status'), {
            params: {
                workspaceId
            }
        }).then(payload => payload.vault);
    },

    setup: function(workspaceId, password) {
        return this.requestJson('POST', FileManagementEnv.apiUrl('/api/files/private-vault/setup'), {
            jsonData: {
                workspaceId,
                password
            }
        }).then(payload => payload.vault);
    },

    unlock: function(workspaceId, password) {
        return this.requestJson('POST', FileManagementEnv.apiUrl('/api/files/private-vault/unlock'), {
            jsonData: {
                workspaceId,
                password
            }
        }).then(payload => payload.vault);
    },

    getFailurePayload: function(response) {
        if (!response) {
            return {};
        }

        if (response.payload) {
            return response.payload;
        }

        if (response.responseText) {
            return Ext.decode(response.responseText, true) || {};
        }

        if (response.message || response.error || response.code) {
            return {
                message: response.message,
                error: response.error,
                code: response.code
            };
        }

        return {};
    },

    getFailureMessage: function(response) {
        const payload = this.getFailurePayload(response);
        return payload.message ||
            payload.error ||
            (response && response.message) ||
            (response && response.responseText) ||
            (response && response.statusText) ||
            '';
    },

    isPasswordAccessFailure: function(response) {
        if (!response) {
            return false;
        }

        const status = Number(response.status || response.statusCode || 0);
        const payload = this.getFailurePayload(response);
        const message = String(this.getFailureMessage(response)).toLowerCase();

        return (status === 401 || status === 403) && (
            payload.code === 'PASSWORD_ACCESS_REQUIRED' ||
            message.indexOf('password verification required') !== -1
        );
    },

    isPrivateVaultGrid: function(grid) {
        return !!(grid &&
            !grid.destroyed &&
            !grid.destroying &&
            grid.privateVaultMode &&
            grid.privateVaultRootId);
    },

    buildVaultFromGrid: function(grid) {
        return {
            workspaceId: grid.workspaceId || FileManagement.components.utils.WorkspaceContext.getActiveWorkspaceId(),
            rootFolderId: grid.privateVaultRootId,
            name: grid.privateVaultName || 'Private Vault'
        };
    },

    ensureGridUnlocked: function(grid, onUnlock) {
        if (!this.isPrivateVaultGrid(grid)) {
            return true;
        }

        if (FileManagement.components.utils.AccessTracker.isItemVerified(grid.privateVaultRootId)) {
            return true;
        }

        this.promptUnlockForGrid(grid, {
            onUnlock: onUnlock
        });
        return false;
    },

    handleAccessExpired: function(response, grid, options = {}) {
        if (!this.isPasswordAccessFailure(response) || !this.isPrivateVaultGrid(grid)) {
            return false;
        }

        this.promptUnlockForGrid(grid, options);
        return true;
    },

    createErrorFromFetchResponse: function(response, fallbackMessage) {
        return response.text().then(text => {
            const payload = text ? (Ext.decode(text, true) || {}) : {};
            const error = new Error(payload.message || payload.error || text || fallbackMessage || response.statusText || 'Request failed.');
            error.status = response.status;
            error.statusText = response.statusText;
            error.responseText = text;
            error.payload = payload;
            error.code = payload.code;
            return error;
        });
    },

    promptUnlockForGrid: function(grid, options = {}) {
        if (!this.isPrivateVaultGrid(grid)) {
            return false;
        }

        const callback = Ext.isFunction(options.onUnlock) ? options.onUnlock : null;
        grid.privateVaultUnlockCallbacks = grid.privateVaultUnlockCallbacks || [];

        if (callback) {
            grid.privateVaultUnlockCallbacks.push(callback);
        }

        FileManagement.components.utils.AccessTracker.removeVerifiedItem(grid.privateVaultRootId);

        if (grid.setLoading) {
            grid.setLoading(false);
        }

        if (grid.privateVaultUnlockInProgress) {
            return true;
        }

        grid.privateVaultUnlockInProgress = true;

        const vault = this.buildVaultFromGrid(grid);
        const workspace = {
            id: vault.workspaceId
        };

        this.showUnlockDialog(workspace, vault, {
            message: options.message || 'Your Private Vault session expired. Enter your vault password to continue.',
            onUnlock: unlockedVault => {
                const callbacks = grid.privateVaultUnlockCallbacks || [];
                grid.privateVaultUnlockCallbacks = [];
                grid.privateVaultUnlockInProgress = false;

                if (grid.destroyed || grid.destroying) {
                    return;
                }

                const nextVault = unlockedVault || vault;
                grid.privateVaultRootId = nextVault.rootFolderId || grid.privateVaultRootId;
                grid.privateVaultName = nextVault.name || grid.privateVaultName || 'Private Vault';
                grid.workspaceId = nextVault.workspaceId || grid.workspaceId;

                if (grid.privateVaultRootId) {
                    FileManagement.components.utils.AccessTracker.addVerifiedItem(grid.privateVaultRootId);
                }

                if (callbacks.length) {
                    Ext.Array.each(callbacks, function(fn) {
                        fn(nextVault);
                    });
                    return;
                }

                if (grid.loadFiles) {
                    grid.loadFiles();
                }
            },
            onCancel: () => {
                grid.privateVaultUnlockCallbacks = [];
                grid.privateVaultUnlockInProgress = false;

                if (Ext.isFunction(options.onCancel)) {
                    options.onCancel();
                }
            }
        });

        return true;
    },

    openPrivateVault: function() {
        FileManagement.components.utils.WorkspaceContext.load().then(() => {
            const workspace = this.getPersonalWorkspace();
            if (!workspace) {
                return;
            }

            this.getStatus(workspace.id)
                .then(vault => {
                    if (!vault || !vault.exists) {
                        this.showSetupDialog(workspace);
                        return;
                    }

                    if (vault.locked) {
                        this.showUnlockDialog(workspace, vault);
                        return;
                    }

                    this.openVaultGrid(vault);
                })
                .catch(error => this.showError(error));
        });
    },

    openVaultGrid: function(vault) {
        if (!vault || !vault.rootFolderId) {
            return null;
        }

        FileManagement.components.utils.AccessTracker.addVerifiedItem(vault.rootFolderId);

        return FileManagement.components.utils.PanelUtils.openPrivateVault({
            workspaceId: vault.workspaceId,
            privateVaultRootId: vault.rootFolderId,
            privateVaultName: vault.name || 'Private Vault'
        });
    },

    showSetupDialog: function(workspace) {
        const manager = this;

        const window = Ext.create('Ext.window.Window', {
            title: 'Set Up Private Vault',
            modal: true,
            width: 380,
            bodyPadding: 14,
            layout: 'fit',
            items: [{
                xtype: 'form',
                border: false,
                defaults: {
                    anchor: '100%',
                    labelAlign: 'top',
                    allowBlank: false
                },
                items: [
                    {
                        xtype: 'component',
                        margin: '0 0 12 0',
                        html: '<div style="color:#36506b;line-height:18px;">Create a personal-only vault protected by a separate password.</div>'
                    },
                    {
                        xtype: 'textfield',
                        itemId: 'passwordField',
                        fieldLabel: 'Vault password',
                        inputType: 'password',
                        minLength: 6
                    },
                    {
                        xtype: 'textfield',
                        itemId: 'confirmPasswordField',
                        fieldLabel: 'Confirm password',
                        inputType: 'password',
                        minLength: 6
                    }
                ]
            }],
            buttons: [
                {
                    text: 'Create Vault',
                    iconCls: 'fa fa-lock',
                    handler: function(button) {
                        const form = button.up('window').down('form');
                        const password = form.down('#passwordField').getValue();
                        const confirmPassword = form.down('#confirmPasswordField').getValue();

                        if (!form.isValid()) {
                            return;
                        }

                        if (password !== confirmPassword) {
                            Ext.Msg.alert('Private Vault', 'Passwords do not match.');
                            return;
                        }

                        window.setLoading('Creating Private Vault...');
                        manager.setup(workspace.id, password)
                            .then(vault => {
                                window.close();
                                manager.openVaultGrid(vault);
                            })
                            .catch(error => manager.showError(error))
                            .finally(() => {
                                if (!window.destroyed) {
                                    window.setLoading(false);
                                }
                            });
                    }
                },
                {
                    text: 'Cancel',
                    handler: function(button) {
                        button.up('window').close();
                    }
                }
            ]
        });

        window.show();
    },

    showUnlockDialog: function(workspace, vault, options = {}) {
        const manager = this;
        const state = {
            completed: false
        };

        const window = Ext.create('Ext.window.Window', {
            title: 'Unlock Private Vault',
            modal: true,
            width: 340,
            bodyPadding: 14,
            layout: 'anchor',
            defaults: {
                anchor: '100%',
                labelAlign: 'top',
                allowBlank: false
            },
            items: [
                {
                    xtype: 'component',
                    margin: '0 0 12 0',
                    html: '<div style="color:#36506b;line-height:18px;">' +
                        Ext.String.htmlEncode(options.message || 'Enter your vault password to open this personal workspace vault.') +
                        '</div>'
                },
                {
                    xtype: 'textfield',
                    itemId: 'passwordField',
                    fieldLabel: 'Vault password',
                    inputType: 'password'
                }
            ],
            buttons: [
                {
                    text: 'Unlock',
                    iconCls: 'fa fa-unlock',
                    handler: function(button) {
                        const passwordField = button.up('window').down('#passwordField');
                        const password = passwordField.getValue();

                        if (!password) {
                            passwordField.markInvalid('Password is required.');
                            return;
                        }

                        window.setLoading('Unlocking Private Vault...');
                        manager.unlock(workspace.id, password)
                            .then(vault => {
                                state.completed = true;
                                window.close();
                                if (Ext.isFunction(options.onUnlock)) {
                                    options.onUnlock(vault);
                                } else {
                                    manager.openVaultGrid(vault);
                                }
                            })
                            .catch(error => manager.showError(error))
                            .finally(() => {
                                if (!window.destroyed) {
                                    window.setLoading(false);
                                }
                            });
                    }
                },
                {
                    text: 'Cancel',
                    handler: function(button) {
                        state.completed = true;
                        button.up('window').close();
                        if (Ext.isFunction(options.onCancel)) {
                            options.onCancel();
                        }
                    }
                }
            ],
            listeners: {
                beforeclose: function() {
                    if (!state.completed && Ext.isFunction(options.onCancel)) {
                        state.completed = true;
                        options.onCancel();
                    }
                },
                afterrender: function(panel) {
                    panel.down('#passwordField').focus(false, 100);
                }
            }
        });

        window.show();
    },

    showError: function(error) {
        Ext.Msg.alert('Private Vault', error && error.message ? error.message : 'Private Vault request failed.');
    }
});
