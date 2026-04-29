// frontend/components/forms/auth/RegisterForm.js
Ext.define('FileManagement.components.forms.auth.RegisterForm', {
    extend: 'Ext.window.Window',
    xtype: 'registerform',
    title: 'Register',
    modal: true,
    closable: false,
    resizable: false,
    width: 300,
    layout: 'fit',
    autoShow: true,
    bodyPadding: 10,
    headers: {},
    items: {
        xtype: 'form',
        bodyStyle: 'background: transparent; border: none;',  // Set form body to transparent
        items: [
            { xtype: 'textfield', name: 'username', fieldLabel: 'Username', allowBlank: false },
            { xtype: 'textfield', name: 'email', fieldLabel: 'Email', allowBlank: false, vtype: 'email' },
            { xtype: 'textfield', name: 'password', fieldLabel: 'Password', inputType: 'password', allowBlank: false }
        ],
        buttons: [
            {
                text: 'Register',
                handler: function(btn) {
                    const form = btn.up('form').getForm();
                    if (form.isValid()) {
                        form.submit({
                            url: FileManagementEnv.apiUrl('/api/auth/register'),
                            success: function(form) {
                                const registerWindow = btn.up('window');
                                const values = form.getValues();

                                Ext.Msg.alert('Success', 'Registration successful', function() {
                                    if (!registerWindow || registerWindow.destroyed) {
                                        return;
                                    }

                                    if (registerWindow.hasListeners && registerWindow.hasListeners.registrationSuccess) {
                                        registerWindow.fireEvent('registrationSuccess', registerWindow, values);
                                        return;
                                    }

                                    registerWindow.close();
                                    Ext.create('FileManagement.components.forms.auth.LoginForm');
                                });
                            },
                            failure: function(form, action) {
                                Ext.Msg.alert('Failed', action.result ? action.result.error : 'Server error');
                            }
                        });
                    }
                }
            },
            {
                text: 'Back to Login',
                id: 'registerform-loginbutton'
            }
        ]
    }
});
