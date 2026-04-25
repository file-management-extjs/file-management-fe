Ext.define('FileManagement.components.utils.ResponsivePanel', {
    singleton: true,

    mobileBreakpoint: 720,
    mobileMargin: 8,
    initialized: false,

    init: function() {
        if (this.initialized || !Ext.panel || !Ext.panel.Panel) {
            return;
        }

        this.initialized = true;

        if (!Ext.panel.Panel.fileManagementResponsivePanelPatchApplied) {
            Ext.panel.Panel.fileManagementResponsivePanelPatchApplied = true;

            Ext.override(Ext.panel.Panel, {
                show: function() {
                    const result = this.callParent(arguments);

                    if (this.floating && !this.preventResponsiveFloatingFit) {
                        Ext.defer(function(panel) {
                            FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
                        }, 1, null, [this]);
                    }

                    return result;
                }
            });
        }
    },

    isMobile: function() {
        return Ext.Element.getViewportWidth() < this.mobileBreakpoint;
    },

    fitFloatingPanel: function(panel) {
        if (!panel || panel.destroyed || panel.destroying || !panel.rendered || !panel.floating || panel.preventResponsiveFloatingFit) {
            return;
        }

        if (panel.isToast || panel.isMenu || panel.xtype === 'menu' || panel.xtype === 'tooltip') {
            return;
        }

        if (!panel.responsiveFloatingOriginal) {
            panel.responsiveFloatingOriginal = {
                width: panel.width || (panel.getWidth ? panel.getWidth() : null),
                height: panel.height || (panel.getHeight ? panel.getHeight() : null),
                maxHeight: panel.maxHeight,
                x: panel.x,
                y: panel.y
            };
        }

        if (!this.isMobile()) {
            this.restoreFloatingPanel(panel);
            return;
        }

        const fitBox = this.getFitBox(panel);
        const margin = this.mobileMargin;
        const availableWidth = Math.max(260, fitBox.width - (margin * 2));
        const availableHeight = Math.max(220, fitBox.height - (margin * 2));
        const fill = !!panel.mobileFloatingFill;
        const original = panel.responsiveFloatingOriginal || {};
        const originalWidth = Number(original.width) || (panel.getWidth ? panel.getWidth() : availableWidth);
        const originalHeight = Number(original.height) || (panel.getHeight ? panel.getHeight() : availableHeight);
        const nextWidth = fill ? availableWidth : Math.min(originalWidth, availableWidth);
        const nextHeight = fill ? availableHeight : Math.min(originalHeight, availableHeight);
        const nextX = fill ? fitBox.x + margin : fitBox.x + Math.max(margin, Math.floor((fitBox.width - nextWidth) / 2));
        const nextY = fill ? fitBox.y + margin : fitBox.y + Math.max(margin, Math.floor((fitBox.height - nextHeight) / 2));

        panel.addCls('mobile-floating-panel');
        panel.responsiveFloatingApplying = true;

        try {
            panel.setSize(nextWidth, nextHeight);
            panel.setPosition(nextX, nextY);

            if (panel.setMaxHeight) {
                panel.setMaxHeight(availableHeight);
            } else {
                panel.maxHeight = availableHeight;
            }
        } finally {
            panel.responsiveFloatingApplying = false;
        }

        this.afterFloatingFit(panel);
    },

    refitVisibleFloatingPanels: function() {
        if (!Ext.ComponentQuery) {
            return;
        }

        const seen = {};
        const panels = Ext.ComponentQuery.query('panel').concat(Ext.ComponentQuery.query('window'));

        Ext.Array.forEach(panels, panel => {
            if (!panel || seen[panel.id] || !panel.floating || !panel.isVisible || !panel.isVisible()) {
                return;
            }

            seen[panel.id] = true;
            this.fitFloatingPanel(panel);
        });
    },

    restoreFloatingPanel: function(panel) {
        if (!panel.responsiveFloatingOriginal) {
            return;
        }

        panel.removeCls('mobile-floating-panel');

        const original = panel.responsiveFloatingOriginal;
        if (original.width && original.height && panel.getWidth && panel.getHeight) {
            const currentWidth = panel.getWidth();
            const currentHeight = panel.getHeight();

            if (currentWidth !== original.width || currentHeight !== original.height) {
                panel.setSize(original.width, original.height);
            }
        }

        if (panel.setMaxHeight) {
            try {
                panel.setMaxHeight(original.maxHeight || null);
            } catch (error) {
                panel.maxHeight = original.maxHeight;
            }
        } else {
            panel.maxHeight = original.maxHeight;
        }
    },

    getFitBox: function(panel) {
        const toolbar = Ext.ComponentQuery.query('#userToolbar')[0];
        const toolbarHeight = toolbar && toolbar.rendered ? toolbar.getHeight() : 0;
        const viewportBox = {
            x: 0,
            y: 0,
            width: Ext.Element.getViewportWidth(),
            height: Math.max(220, Ext.Element.getViewportHeight() - toolbarHeight)
        };

        if (!panel.mobileFloatingFitToWorkspace) {
            return viewportBox;
        }

        const workspace = Ext.getCmp('mainPanelRegion');
        if (!workspace || !workspace.rendered || !workspace.getBox) {
            return viewportBox;
        }

        const workspaceBox = workspace.getBox();
        return {
            x: workspaceBox.x,
            y: workspaceBox.y,
            width: workspaceBox.width,
            height: Math.max(220, workspaceBox.height)
        };
    },

    afterFloatingFit: function(panel) {
        if (FileManagement.components.utils.ResponsiveGrid) {
            FileManagement.components.utils.ResponsiveGrid.prepareContainer(panel);
            FileManagement.components.utils.ResponsiveGrid.applyContainer(panel);
        }

        if (panel.updateLayout) {
            panel.updateLayout();
        }
    },

    fitPopoverToViewport: function(popover, anchorButton) {
        if (!popover || popover.destroyed || popover.destroying || !popover.rendered || !this.isMobile()) {
            return;
        }

        const toolbar = Ext.ComponentQuery.query('#userToolbar')[0];
        const toolbarHeight = toolbar && toolbar.rendered ? toolbar.getHeight() : 0;
        const margin = this.mobileMargin;
        const width = Math.max(260, Ext.Element.getViewportWidth() - (margin * 2));
        const height = Math.min(popover.getHeight ? popover.getHeight() : 300, Math.max(180, Ext.Element.getViewportHeight() - toolbarHeight - (margin * 2)));
        const x = margin;
        const y = Math.max(margin, Ext.Element.getViewportHeight() - toolbarHeight - height - margin);

        popover.addCls('mobile-floating-panel');
        popover.setSize(width, height);
        popover.setPosition(x, y);

        if (anchorButton && anchorButton.addCls) {
            anchorButton.addCls('active');
        }
    }
});
