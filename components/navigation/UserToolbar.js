Ext.define('FileManagement.components.navigation.UserToolbar', {
    extend: 'Ext.toolbar.Toolbar',
    xtype: 'userToolbar',
    requires: [
        'FileManagement.helpers.Functions'
    ],
    id: 'userToolbar',
    cls: 'x-toolbar-classic',
    style: {
        // position: 'sticky',
        bottom: '0px !important',
        zIndex: 1000,
        height: '28px !important',
        display: 'flex',
        alignItems: 'center'
    },

    openedPanels: {},
    index: 1,
    mobileActionsBreakpoint: 560,

    removePanelToggleButton: (panel) => {
        // Remove the toggle button associated with the panel
        const toggleButton = this.openedPanels[panel.id];
        if (toggleButton) {
            this.remove(toggleButton);
            delete this.openedPanels[panel.id];
        }
    },

    initComponent: function() {
        const username = FileManagement.helpers.Functions.getUsername();

        Ext.apply(this, {
            listeners: {
                afterrender: function(toolbar) {
                    toolbar.applyResponsiveActions();
                },
                resize: function(toolbar) {
                    toolbar.applyResponsiveActions();
                    FileManagement.components.navigation.UserToolbar.syncOpenedPanelsScrollWidth(toolbar.down('#openedPanels'));
                }
            },
            items: [
                {
                    xtype: 'tbtext',
                    text: `Welcome, ${username}` // Display username on the left
                },
                {
                    xtype: 'tbseparator'
                },
                {
                    xtype: 'container',
                    itemId: 'openedPanels',
                    id: 'openedPanels',
                    flex: 1,
                    minWidth: 90,
                    layout: {
                        type: 'hbox',
                        align: 'stretch'
                    },
                    cls: 'x-toolbar-classic taskbar-opened-panels',
                    items: [
                        {
                            xtype: 'button',
                            itemId: 'fileExplorerToggle',
                            text: 'Files Explorer',
                            iconCls: 'fa fa-folder-open fa-2xs',
                            enableToggle: true,
                            padding: 1,
                            handler: function(button) {
                                if (button.suppressTaskbarToggle) {
                                    return;
                                }

                                const fileGridPanel = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
                                if (!fileGridPanel) {
                                    FileManagement.components.utils.PanelUtils.openFileExplorer({
                                        refBottomToolbarButton: button
                                    });
                                    return;
                                }

                                if (fileGridPanel.minimizedToTaskbar || !fileGridPanel.isVisible()) {
                                    FileManagement.components.utils.PanelUtils.restoreFromTaskbar(fileGridPanel);
                                } else {
                                    FileManagement.components.utils.PanelUtils.minimizeToTaskbar(fileGridPanel);
                                }
                            }
                        }
                    ],
                    listeners: {
                        afterrender: function(container) {
                            FileManagement.components.navigation.UserToolbar.bindOpenedPanelsScroller(container);
                            FileManagement.components.navigation.UserToolbar.syncOpenedPanelsScrollWidth(container);
                        },
                        resize: function(container) {
                            FileManagement.components.navigation.UserToolbar.syncOpenedPanelsScrollWidth(container);
                        }
                    }
                },
                {
                    xtype: 'container',
                    itemId: 'progressBar',
                    items: []
                },
                {
                    xtype: 'button',
                    itemId: 'keyboardShortcutsButton',
                    text: 'K-Shortcuts',
                    iconCls: 'fa fa-regular fa-keyboard',
                    handler: function() {
                        FileManagement.components.navigation.UserToolbar.showKeyboardShortcuts();
                    }
                },
                {
                    xtype: 'button',
                    itemId: 'logoutButton',
                    text: 'Logout',
                    iconCls: 'fa fa-sign-out',
                    handler: function() {
                        FileManagement.components.navigation.UserToolbar.confirmLogout();
                    }
                },
                {
                    xtype: 'button',
                    itemId: 'toolbarActionsMenuButton',
                    cls: 'taskbar-actions-menu',
                    iconCls: 'fa fa-bars',
                    tooltip: 'More actions',
                    hidden: true,
                    menu: [
                        {
                            text: 'Keyboard Shortcuts',
                            iconCls: 'fa fa-regular fa-keyboard',
                            handler: function() {
                                FileManagement.components.navigation.UserToolbar.showKeyboardShortcuts();
                            }
                        },
                        '-',
                        {
                            text: 'Logout',
                            iconCls: 'fa fa-sign-out',
                            handler: function() {
                                FileManagement.components.navigation.UserToolbar.confirmLogout();
                            }
                        }
                    ]
                }
            ]
        });

        this.addPanelToggleButton = (panel, label, icon) => {
            const me = this;
            const existingButton = me.openedPanels[panel.id];

            if (existingButton && !existingButton.destroyed) {
                existingButton.panelRef = panel;
                existingButton.setText(label);
                existingButton.setIconCls(icon);
                FileManagement.components.utils.PanelUtils.setPanelTogglePressed(panel, true);
                return existingButton;
            }

            // Dynamically add a toggle button for the panel
            // Track the panel and its button
            me.openedPanels[panel.id] = me.down('#openedPanels').insert(me.index, {
                xtype: 'button',
                text: label,
                enableToggle: true,
                pressed: true,
                maxWidth:  150,
                closable: true,
                margin: '0 1px',
                cls: 'ellipsis',
                iconCls: icon,
                panelRef: panel,
                handler: function (btn) {
                    if (btn.suppressTaskbarToggle) {
                        return;
                    }

                    const panel = btn.panelRef;
                    if (!panel || panel.destroyed || panel.destroying) {
                        me.removePanelToggleButton(panel);
                        return;
                    }

                    if (panel.minimizedToTaskbar || !panel.isVisible()) {
                        FileManagement.components.utils.PanelUtils.restoreFromTaskbar(panel);
                    } else {
                        FileManagement.components.utils.PanelUtils.minimizeToTaskbar(panel);
                    }
                }
            });

            me.scrollTaskbarToButton(me.openedPanels[panel.id]);
            panel.on('destroy', () => me.removePanelToggleButton(panel));

            me.index++;
        };

        this.removePanelToggleButton = function(panel) {
            if (!panel) {
                return;
            }

            // Remove the toggle button associated with the panel
            const toggleButton = this.openedPanels[panel.id];
            if (toggleButton) {
                this.down('#openedPanels').remove(toggleButton);
                delete this.openedPanels[panel.id];
            }

            FileManagement.components.navigation.UserToolbar.syncOpenedPanelsScrollWidth(this.down('#openedPanels'));
            this.index--;
        }

        this.callParent(arguments);
    },

    scrollTaskbarToButton: function(button) {
        if (!button || button.destroyed) {
            return;
        }

        const openedPanels = this.down('#openedPanels');
        const scrollEl = FileManagement.components.navigation.UserToolbar.getOpenedPanelsScrollEl(openedPanels);
        if (!scrollEl) {
            return;
        }

        Ext.defer(function() {
            if (!button.rendered || !button.getEl()) {
                return;
            }

            FileManagement.components.navigation.UserToolbar.syncOpenedPanelsScrollWidth(openedPanels);

            const buttonEl = button.getEl().dom;
            const left = buttonEl.offsetLeft;
            const right = left + buttonEl.offsetWidth;
            const visibleLeft = scrollEl.scrollLeft;
            const visibleRight = visibleLeft + scrollEl.clientWidth;

            if (right > visibleRight) {
                scrollEl.scrollLeft = right - scrollEl.clientWidth;
            } else if (left < visibleLeft) {
                scrollEl.scrollLeft = left;
            }
        }, 50);
    },

    applyResponsiveActions: function() {
        if (!this.rendered) {
            return;
        }

        const compact = Ext.Element.getViewportWidth() < this.mobileActionsBreakpoint;
        const shortcutsButton = this.down('#keyboardShortcutsButton');
        const logoutButton = this.down('#logoutButton');
        const menuButton = this.down('#toolbarActionsMenuButton');

        Ext.suspendLayouts();
        try {
            if (shortcutsButton) {
                shortcutsButton.setHidden(compact);
            }

            if (logoutButton) {
                logoutButton.setHidden(compact);
            }

            if (menuButton) {
                menuButton.setHidden(!compact);
            }
        } finally {
            Ext.resumeLayouts(true);
        }
    },

    statics: {
        showKeyboardShortcuts: function() {
            Ext.require('FileManagement.components.utils.KeyboardShortcuts', function() {
                FileManagement.components.utils.KeyboardShortcuts.showShortcutsWindow();
            });
        },

        confirmLogout: function() {
            Ext.Msg.confirm('Confirm Logout', 'Are you sure you want to log out?', function(choice) {
                if (choice === 'yes') {
                    FileManagement.helpers.Functions.logout();
                }
            });
        },

        getOpenedPanelsScrollEl: function(container) {
            if (!container || !container.rendered) {
                return null;
            }

            const inner = Ext.get(`${container.id}-innerCt`);
            return inner && inner.dom ? inner.dom : container.getEl().dom;
        },

        syncOpenedPanelsScrollWidth: function(container) {
            if (!container || !container.rendered) {
                return;
            }

            Ext.defer(function() {
                const scrollEl = FileManagement.components.navigation.UserToolbar.getOpenedPanelsScrollEl(container);
                const targetEl = Ext.get(`${container.id}-targetEl`);
                if (!scrollEl || !targetEl || !targetEl.dom) {
                    return;
                }

                let contentWidth = 0;
                Ext.Array.forEach(Array.prototype.slice.call(targetEl.dom.children), function(child) {
                    contentWidth = Math.max(contentWidth, child.offsetLeft + child.offsetWidth);
                });

                targetEl.dom.style.width = `${Math.max(scrollEl.clientWidth, contentWidth + 4)}px`;
            }, 20);
        },

        bindOpenedPanelsScroller: function(container) {
            const el = FileManagement.components.navigation.UserToolbar.getOpenedPanelsScrollEl(container);
            if (!el || el.taskbarScrollBound) {
                return;
            }

            el.taskbarScrollBound = true;
            let isMouseDown = false;
            let startX = 0;
            let scrollLeft = 0;
            let didDrag = false;

            const beginDrag = function(pageX) {
                isMouseDown = true;
                didDrag = false;
                startX = pageX;
                scrollLeft = el.scrollLeft;
                el.classList.add('taskbar-drag-scroll-active');
            };

            const endDrag = function() {
                isMouseDown = false;
                el.classList.remove('taskbar-drag-scroll-active');
            };

            const dragTo = function(pageX, event) {
                if (!isMouseDown) {
                    return;
                }

                const distance = pageX - startX;
                if (Math.abs(distance) > 3) {
                    didDrag = true;
                }

                if (event && event.cancelable !== false) {
                    event.preventDefault();
                }

                el.scrollLeft = scrollLeft - (distance * 1.5);
            };

            el.addEventListener('wheel', function(e) {
                const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                if (!delta) {
                    return;
                }

                if (e.cancelable !== false) {
                    e.preventDefault();
                }

                el.scrollLeft += delta;
            }, { passive: false });

            el.addEventListener('mousedown', function(e) {
                if (e.button !== 0) {
                    return;
                }

                beginDrag(e.pageX);
            });

            el.addEventListener('mouseleave', endDrag);

            el.addEventListener('mouseup', endDrag);

            el.addEventListener('mousemove', function(e) {
                dragTo(e.pageX, e);
            });

            el.addEventListener('touchstart', function(e) {
                if (!e.touches || e.touches.length !== 1) {
                    return;
                }

                beginDrag(e.touches[0].pageX);
            }, { passive: true });

            el.addEventListener('touchmove', function(e) {
                if (!e.touches || e.touches.length !== 1) {
                    return;
                }

                dragTo(e.touches[0].pageX, e);
            }, { passive: false });

            el.addEventListener('touchend', endDrag);
            el.addEventListener('touchcancel', endDrag);

            el.addEventListener('click', function(e) {
                if (!didDrag) {
                    return;
                }

                didDrag = false;
                e.preventDefault();
                e.stopPropagation();
            }, true);
        }
    }
});
