Ext.Loader.setPath({
    'FileManagement.components.stores': './components/stores',
    'FileManagement.components.grids': './components/grids',
    'FileManagement.components.forms': './components/forms',
    'FileManagement.components.viewers': './components/viewers',
    'FileManagement.components.utils': './components/utils',
    'FileManagement.components.navigation': './components/navigation',
    'FileManagement.components.models': './components/models',
    'FileManagement.components.actions': './components/actions',
    'FileManagement.components.dialogs': './components/dialogs',
    'FileManagement.components.search': './components/search',
    'FileManagement.components.dashboard': './components/dashboard',
    'FileManagement.components.status': './components/status',
    'FileManagement.components.settings': './components/settings',
    'FileManagement.components.storage': './components/storage',
    'FileManagement.components.organizations': './components/organizations',
    'FileManagement.helpers': './helpers',
});

Ext.onReady(function() {
	    if (Ext.event && Ext.event.Event && !Ext.event.Event.fileManagementPassivePatchApplied) {
	        Ext.event.Event.fileManagementPassivePatchApplied = true;

	        const eventPrototype = Ext.event.Event.prototype;
	        const originalPreventDefault = eventPrototype.preventDefault;
	        const originalStopEvent = eventPrototype.stopEvent;
	        const passiveRootEvents = {
	            touchstart: true,
	            touchmove: true,
	            wheel: true,
	            mousewheel: true
	        };
	        const isPassiveRootEvent = function(browserEvent) {
	            const currentTarget = browserEvent && browserEvent.currentTarget;
	            return !!(browserEvent &&
	                passiveRootEvents[browserEvent.type] &&
	                (currentTarget === window ||
	                    currentTarget === document ||
	                    currentTarget === document.body ||
	                    currentTarget === document.documentElement));
	        };

	        eventPrototype.preventDefault = function() {
	            const browserEvent = this.browserEvent || this.event;
	            if (browserEvent && (browserEvent.cancelable === false || isPassiveRootEvent(browserEvent))) {
	                return this;
	            }

	            try {
	                return originalPreventDefault.apply(this, arguments);
	            } catch (error) {
	                return this;
	            }
	        };

	        eventPrototype.stopEvent = function() {
	            const browserEvent = this.browserEvent || this.event;
	            if (browserEvent && (browserEvent.cancelable === false || isPassiveRootEvent(browserEvent))) {
	                this.stopPropagation();
	                return this;
	            }

	            try {
	                return originalStopEvent.apply(this, arguments);
	            } catch (error) {
	                this.stopPropagation();
	                return this;
	            }
	        };
	    }

});

Ext.application({
    name: 'FileManagement',

    requires: [
        'Ext.container.Viewport',
        'FileManagement.components.utils.MessageBoxFix',
        'FileManagement.components.utils.ResponsivePanel',
        'FileManagement.components.utils.GridFocusGuard',
        'FileManagement.components.utils.ResponsiveGrid',
        'FileManagement.components.grids.FileGrid',
        'FileManagement.components.viewers.ViewerFactory',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.utils.WorkspaceContext',
        'FileManagement.components.navigation.NavigationPanel',
        'FileManagement.components.navigation.UserToolbar',
        'FileManagement.components.dashboard.HomeDashboard',
        'FileManagement.components.forms.FolderCreateForm',
        'FileManagement.components.forms.auth.LoginForm',
        'FileManagement.components.forms.auth.RegisterForm',
        'FileManagement.helpers.Functions',
        'FileManagement.components.utils.SocketManager',
        'FileManagement.components.utils.ProgressBarManager',
        'FileManagement.components.utils.UploadSessionManager',
        'FileManagement.components.status.UploadRecoveryPanel',
        'FileManagement.components.status.ActivityCenterPanel',
        'FileManagement.components.status.MediaConversionQueuePanel',
        'FileManagement.components.status.DocumentConversionQueuePanel',
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.settings.UserSettingsPanel',
        'FileManagement.components.organizations.OrganizationAdminPanel',
        'FileManagement.components.utils.SnapAssist',
        'FileManagement.components.utils.KeyboardShortcuts',
    ],

    launch: function() {
        FileManagement.components.utils.MessageBoxFix.init();
        FileManagement.components.utils.GridFocusGuard.init();
        FileManagement.components.utils.ResponsivePanel.init();
        FileManagement.components.utils.ResponsiveGrid.init();
        FileManagement.helpers.Functions.installAuthFailureHandlers();
        Ext.Ajax.setDefaultHeaders({
            'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader()
        });

        const isAuthenticated = !!FileManagement.helpers.Functions.getToken();

        const loadMainView = () => {
            const syncResponsiveShell = Ext.Function.createBuffered(function(viewPort) {
                const width = viewPort && viewPort.getWidth ? viewPort.getWidth() : Ext.Element.getViewportWidth();
                const navPanel = Ext.getCmp('navigationpanel');
                const mainPanel = Ext.getCmp('mainPanelRegion');

                if (navPanel) {
                    if (width < 720) {
                        navPanel.mobileAutoCollapsed = true;
                        navPanel.setWidth(Math.min(220, Math.max(180, width - 96)));

                        if (!navPanel.collapsed) {
                            navPanel.collapse();
                        }

                        if (navPanel.fitMobileOverlayPanel) {
                            navPanel.fitMobileOverlayPanel();
                        }
                    } else {
                        if (navPanel.hideMobileOverlay) {
                            navPanel.hideMobileOverlay();
                        }

                        navPanel.setWidth(250);

                        if (width >= 900 && navPanel.mobileAutoCollapsed && navPanel.collapsed) {
                            navPanel.expand();
                        }

                        navPanel.mobileAutoCollapsed = false;
                    }
                }

                if (mainPanel) {
                    const dashboard = mainPanel.down('homedashboard');
                    if (dashboard && dashboard.fitToWorkspace) {
                        dashboard.fitToWorkspace(mainPanel);
                    }

                    FileManagement.components.utils.PanelUtils.refitWorkspacePanels();
                    FileManagement.components.utils.ResponsivePanel.refitVisibleFloatingPanels();
                }
            }, 100);

            // Create the viewport with navigation and main panels
            Ext.create('Ext.container.Viewport', {
                layout: 'border',
                style: {
                    backgroundColor: '#eaedf1',
                },
                items: [
                    {
                        region: 'south',
                        xtype: 'userToolbar' // Reference the new UserToolbar component
                    },
                    {
                        region: 'west',
                        xtype: 'navigationpanel',
                        width: 250,
                        split: {
                            cls: 'navigation-panel-splitter'
                        }
                    },
                    {
                        region: 'center',
                        xtype: 'container',
                        layout: 'absolute',
                        id: 'mainPanelRegion',
                        items: [
                            {
                                xtype: 'homedashboard',
                                itemId: 'homeDashboard',
                                x: 0,
                                y: 0
                            }
                        ],
                        listeners: {
                            afterrender: function (container) {
                                const snapAssist = container.down('#snapassist') ||
                                    Ext.create('FileManagement.components.utils.SnapAssist');

                                if (!snapAssist.ownerCt) {
                                    container.add(snapAssist);
                                }

                                snapAssist.initialize(container);

                                let currentIndex = 0; // Initialize index for panel switching
                                window.highestZIndex = 1; // Start z-index tracking

                                // Alt+Q toggling functionality
                                Ext.getBody().on('keydown', function (e) {
                                    if (e.altKey && e.getKey() === Ext.EventObject.Q) {
                                        // Get all visible panels in mainPanelRegion, excluding the navigation panel
                                        // const panels = container.items.filter(panel => panel.isVisible() && panel.itemId !== 'navigationPanel');
                                        const panels = container.items.getRange().filter(
                                            panel => panel.isVisible()
                                                && panel.itemId !== 'navigationPanel'
                                                && panel.itemId !== 'snapassist'
                                        );

                                        if (panels.length === 0) return;

                                        // Reset z-index of the currently active panel
                                        if (panels[currentIndex]) {
                                            panels[currentIndex].getEl().setStyle('z-index', 1);
                                            panels[currentIndex].removeCls('grayed-out');
                                            panels[currentIndex].removeCls('active-panel');
                                        }

                                        // Update the index to the next panel, looping back if necessary
                                        currentIndex = (currentIndex + 1) % panels.length;

                                        // Bring the next panel to the front by setting its z-index
                                        if (panels[currentIndex]) {
                                            FileManagement.components.utils.PanelUtils.activateWorkspacePanel(panels[currentIndex]);
                                        }
                                    }
                                });

                                const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
                                if (navPanel) {
                                    navPanel.refreshPanelList();
                                }

                                FileManagement.components.utils.PanelUtils.applyZIndexHighlighting(container);
                            },
                            add: function (parent, panel) {
                                FileManagement.components.utils.PanelUtils.prepareWorkspacePanel(panel);

                                const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
                                if (navPanel) {
                                    navPanel.refreshPanelList();
                                }

                                FileManagement.components.utils.PanelUtils.updateZIndexHighlighting(parent, panel);
                            },
                            remove: function () {
                                const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
                                if (navPanel) {
                                    navPanel.refreshPanelList();
                                }
                            }
                        }
                    }
                ],
                listeners: {
                    afterrender: function (viewPort, e) {
                        FileManagement.components.settings.UserSettings.load(function() {
                            // Initialize runtime services after user preferences are available.
                            FileManagement.components.utils.SocketManager.initSocket();
                            FileManagement.components.utils.UploadSessionManager.init();
                            FileManagement.components.utils.PanelUtils.restoreLastPanels();
                        });
                        syncResponsiveShell(viewPort);
                    },
                    resize: function(viewPort) {
                        syncResponsiveShell(viewPort);
                    }
                },
            });
        };

        if (!isAuthenticated) {
            const loginForm = Ext.create('FileManagement.components.forms.auth.LoginForm');
            const registerForm = Ext.create('FileManagement.components.forms.auth.RegisterForm');

            loginForm.show();
            registerForm.hide();

            loginForm.on('loginSuccess', loadMainView);

            loginForm.down('#loginform-registerbutton').on('click', function() {
                loginForm.setVisible(false);
                registerForm.setVisible(true);
            });

            registerForm.down('#registerform-loginbutton').on('click', function() {
                registerForm.setVisible(false);
                loginForm.setVisible(true);
            });
        } else {
            Ext.onReady(function() {
                // Initialize keyboard shortcuts
                FileManagement.components.utils.KeyboardShortcuts.init();

                loadMainView();
            });
        }
    }
});
