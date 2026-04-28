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

    showUnlockDialog: function(workspace) {
        const manager = this;

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
                    html: '<div style="color:#36506b;line-height:18px;">Enter your vault password to open this personal workspace vault.</div>'
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
            ],
            listeners: {
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
