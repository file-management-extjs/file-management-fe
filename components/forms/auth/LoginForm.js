// frontend/components/forms/auth/LoginForm.js
Ext.define('FileManagement.components.forms.auth.LoginForm', {
    extend: 'Ext.window.Window',
    xtype: 'loginform',
    requires: [
        'FileManagement.helpers.Functions',
        'FileManagement.components.settings.UserSettings'
    ],
    title: 'Login',
    modal: true,
    closable: false,
    resizable: false,
    width: 300,
    layout: 'fit',
    autoShow: true,
    bodyPadding: 10,
    headers: {},
    // Define custom events
    listeners: {
        loginSuccess: 'onLoginSuccess' // Maps to a function or event listener on success
    },

    initComponent: function() {
        this.items = this.createLoginForm();
        this.callParent(arguments);
    },

    createLoginForm: function() {
        const me = this;

        return {
            xtype: 'form',
            bodyStyle: 'background: transparent; border: none;',  // Set form body to transparent
            items: [
                { xtype: 'textfield', name: 'username', fieldLabel: 'Username', allowBlank: false },
                { xtype: 'textfield', name: 'password', fieldLabel: 'Password', inputType: 'password', allowBlank: false },
                {
                    xtype: 'checkbox',
                    name: 'rememberMe',
                    fieldLabel: 'Remember Me',
                    checked: me.getRememberMeDefault()
                }
            ],
            buttons: [
                {
                    text: 'Login',
                    handler: function(btn) {
                        me.submitLogin(btn);
                    }
                },
                {
                    text: 'Register',
                    id: 'loginform-registerbutton'
                }
            ]
        };
    },

    submitLogin: function(btn) {
        const me = this;
        const form = btn.up('form').getForm();

        if (!form.isValid()) {
            return;
        }

        form.submit({
            url: FileManagementEnv.apiUrl('/api/auth/login'),
            success: function(form, action) {
                const { token, username, userId } = action.result;
                const rememberMe = form.findField('rememberMe').getValue();

                me.setRememberMeDefault(rememberMe);
                FileManagement.helpers.Functions.storeAuthSession(
                    { token, username, userId },
                    rememberMe
                );

                // Reload the application to ensure updates
                Ext.Msg.alert('Success', 'Logged in successfully', function() {
                    window.location.reload();
                });
            },
            failure: function(form, action) {
                let errorMessage = action.result && action.result.error;

                if (!errorMessage && action.response && action.response.responseText) {
                    try {
                        const responseJson = Ext.decode(action.response.responseText);
                        errorMessage = responseJson.error || responseJson.message;
                    } catch (e) {
                        // Ignore parse errors and keep fallback message.
                    }
                }

                Ext.Msg.alert('Failed', errorMessage || 'Server error');
            }
        });
    },

    getUserSettings: function() {
        return FileManagement.components &&
            FileManagement.components.settings &&
            FileManagement.components.settings.UserSettings
            ? FileManagement.components.settings.UserSettings
            : null;
    },

    getRememberMeDefault: function() {
        const userSettings = this.getUserSettings();
        if (userSettings && userSettings.getLoginRememberDefault) {
            return userSettings.getLoginRememberDefault();
        }

        try {
            return localStorage.getItem('fileManagement.rememberMeDefault') === 'true';
        } catch (error) {
            return false;
        }
    },

    setRememberMeDefault: function(value) {
        const userSettings = this.getUserSettings();
        if (userSettings && userSettings.setLoginRememberDefault) {
            userSettings.setLoginRememberDefault(value);
            return;
        }

        try {
            localStorage.setItem('fileManagement.rememberMeDefault', value === true ? 'true' : 'false');
        } catch (error) {
            // Browser storage can be unavailable in restricted contexts.
        }
    }
});
