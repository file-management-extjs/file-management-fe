Ext.define('FileManagement.components.utils.PanelUtils', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.ResponsiveGrid',
        'FileManagement.components.utils.SnapAssist',
        'FileManagement.components.organizations.OrganizationAdminPanel'
    ],

    mobileWorkspaceBreakpoint: 720,
    mobileWorkspaceMinWidth: 260,
    mobileWorkspaceMinHeight: 220,
    workspacePanelStateKey: 'fileManagement.lastWorkspacePanels',
    workspacePanelStateRestored: false,
    workspacePanelStateRestoring: false,

    isWorkspacePanel: function(panel) {
        return !!panel &&
            panel instanceof Ext.panel.Panel &&
            panel.xtype !== 'homedashboard' &&
            panel.itemId !== 'homeDashboard' &&
            panel.itemId !== 'snapassist';
    },

    isMobileWorkspace: function(width) {
        const workspaceWidth = Number(width) || this.getWorkspaceSize().width;
        return workspaceWidth < this.mobileWorkspaceBreakpoint;
    },

    getWorkspaceSize: function() {
        const workspace = this.getMainPanelRegion();

        const fallbackSize = {
            width: Ext.Element.getViewportWidth(),
            height: Ext.Element.getViewportHeight()
        };

        if (!workspace || workspace.destroyed || workspace.destroying) {
            return fallbackSize;
        }

        if (workspace.rendered && workspace.getEl && workspace.getEl()) {
            const renderedSize = workspace.getSize();
            if (renderedSize && renderedSize.width && renderedSize.height) {
                return renderedSize;
            }
        }

        if (workspace.lastBox && workspace.lastBox.width && workspace.lastBox.height) {
            return {
                width: workspace.lastBox.width,
                height: workspace.lastBox.height
            };
        }

        if (workspace.width && workspace.height) {
            return {
                width: workspace.width,
                height: workspace.height
            };
        }

        return fallbackSize;
    },

    ensureHighestZIndex: function() {
        if (!Number(window.highestZIndex)) {
            window.highestZIndex = 1;
        }

        return window.highestZIndex;
    },

    getUserSetting: function(path, fallback) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        return settings && settings.get ? settings.get(path, fallback) : fallback;
    },

    getPanelRestoreDescriptor: function(panel) {
        if (!this.isWorkspacePanel(panel) || panel.destroyed || panel.destroying) {
            return null;
        }

        if (panel.isXType && panel.isXType('filegrid')) {
            return {
                type: 'filegrid',
                mode: panel.listMode || (panel.sharedMode ? 'sharedWithMe' : panel.sharedByMeMode ? 'sharedByMe' : 'files')
            };
        }

        const xtype = panel.xtype || (panel.getXType ? panel.getXType() : '');
        const itemId = panel.itemId || '';
        const title = panel.getTitle ? panel.getTitle() : panel.title;
        const matchValue = `${xtype} ${itemId} ${title || ''}`.toLowerCase();

        if (matchValue.indexOf('fileuploadform') !== -1) {
            return { type: 'uploadForm' };
        }

        if (matchValue.indexOf('usersettingspanel') !== -1) {
            return { type: 'userSettings' };
        }

        if (matchValue.indexOf('activitycenterpanel') !== -1) {
            return { type: 'activityCenter' };
        }

        if (matchValue.indexOf('storageinsightspanel') !== -1) {
            return { type: 'storageInsights' };
        }

        if (matchValue.indexOf('organizationadminpanel') !== -1) {
            return { type: 'organizationAdmin' };
        }

        return null;
    },

    saveOpenPanelState: function() {
        const workspace = this.getMainPanelRegion();
        if (!workspace || !workspace.items || this.workspacePanelStateRestoring) {
            return;
        }

        const seen = {};
        const descriptors = [];

        workspace.items.each(panel => {
            const descriptor = this.getPanelRestoreDescriptor(panel);
            if (!descriptor) {
                return;
            }

            const key = `${descriptor.type}:${descriptor.mode || ''}`;
            if (seen[key]) {
                return;
            }

            seen[key] = true;
            descriptors.push(descriptor);
        });

        try {
            localStorage.setItem(this.workspacePanelStateKey, Ext.encode(descriptors));
        } catch (error) {
            // Workspace restore is best-effort and should never block panel actions.
        }
    },

    getSavedPanelState: function() {
        try {
            const raw = localStorage.getItem(this.workspacePanelStateKey);
            const descriptors = raw ? Ext.decode(raw, true) : [];
            return Ext.isArray(descriptors) ? descriptors : [];
        } catch (error) {
            return [];
        }
    },

    restoreLastPanels: function() {
        if (this.workspacePanelStateRestored || this.workspacePanelStateRestoring ||
            this.getUserSetting('workspace.reopenLastPanels', false) !== true) {
            return;
        }

        const descriptors = this.getSavedPanelState();
        if (!descriptors.length) {
            this.workspacePanelStateRestored = true;
            return;
        }

        this.workspacePanelStateRestored = true;
        this.workspacePanelStateRestoring = true;

        Ext.defer(() => {
            try {
                descriptors.forEach(descriptor => this.openPanelFromDescriptor(descriptor));
            } finally {
                this.workspacePanelStateRestoring = false;
                this.updateNavigationPanelList();
            }
        }, 150);
    },

    openPanelFromDescriptor: function(descriptor) {
        if (!descriptor || !descriptor.type) {
            return null;
        }

        switch (descriptor.type) {
            case 'filegrid':
                return this.openFileGridMode(descriptor.mode || 'files');
            case 'uploadForm':
                return this.openUploadForm();
            case 'userSettings':
                return this.openUserSettings();
            case 'activityCenter':
                return this.openActivityCenter();
            case 'storageInsights':
                return this.openStorageInsights();
            case 'organizationAdmin':
                return this.openOrganizationAdmin();
            default:
                return null;
        }
    },

    clearWorkspaceFocusMode: function(container) {
        const workspace = container || this.getMainPanelRegion();

        if (!workspace) {
            return;
        }

        if (workspace.removeCls) {
            workspace.removeCls('workspace-focus-mode');
        }

        if (workspace.items) {
            workspace.items.each(function(item) {
                if (!item || !item.removeCls) {
                    return;
                }

                item.removeCls('grayed-out');
                item.removeCls('workspace-obscured');
                item.removeCls('active-panel');
            });
        }
    },

    focusWorkspaceBackground: function(container) {
        const workspace = container || this.getMainPanelRegion();

        if (!workspace) {
            return;
        }

        this.clearWorkspaceFocusMode(workspace);

        const dashboard = workspace.down ? workspace.down('homedashboard') : null;
        if (dashboard && !dashboard.destroyed) {
            dashboard.show();
            dashboard.removeCls('grayed-out');
            dashboard.removeCls('workspace-obscured');
            dashboard.removeCls('active-panel');

            if (dashboard.fitToWorkspace) {
                dashboard.fitToWorkspace(workspace);
            }
        }
    },

    getWorkspacePanelFromTarget: function(container, target) {
        const workspace = container || this.getMainPanelRegion();

        if (!workspace || !workspace.items || !target) {
            return null;
        }

        let matchedPanel = null;

        workspace.items.each((item) => {
            if (matchedPanel ||
                !this.isWorkspacePanel(item) ||
                item.destroyed ||
                item.destroying ||
                item.minimizedToTaskbar ||
                (item.isVisible && !item.isVisible()) ||
                !item.rendered ||
                !item.getEl() ||
                !item.getEl().dom) {
                return;
            }

            if (item.getEl().dom.contains(target)) {
                matchedPanel = item;
            }
        });

        return matchedPanel;
    },

    registerWorkspaceBackgroundActivation: function(container) {
        if (!container || container.workspaceBackgroundActivationPrepared) {
            return;
        }

        container.workspaceBackgroundActivationPrepared = true;

        const bindActivation = (currentContainer) => {
            if (!currentContainer || currentContainer.destroyed || currentContainer.destroying || !currentContainer.rendered || !currentContainer.getEl()) {
                return;
            }

            const dom = currentContainer.getEl().dom;
            if (!dom || currentContainer.workspaceBackgroundActivationBoundEl === dom) {
                return;
            }

            const focusBackground = (event) => {
                if (this.getWorkspacePanelFromTarget(currentContainer, event.target)) {
                    return;
                }

                this.focusWorkspaceBackground(currentContainer);
            };

            currentContainer.workspaceBackgroundActivationBoundEl = dom;
            currentContainer.workspaceBackgroundActivationHandler = focusBackground;
            dom.addEventListener('mousedown', focusBackground, false);
            dom.addEventListener('touchstart', focusBackground, false);

            currentContainer.on('destroy', function(destroyedContainer) {
                const boundEl = destroyedContainer.workspaceBackgroundActivationBoundEl;
                const handler = destroyedContainer.workspaceBackgroundActivationHandler;

                if (boundEl && handler) {
                    boundEl.removeEventListener('mousedown', handler, false);
                    boundEl.removeEventListener('touchstart', handler, false);
                }
            }, null, { single: true });
        };

        if (container.rendered) {
            bindActivation(container);
        } else {
            container.on('afterrender', bindActivation, null, { single: true });
        }
    },

    setWorkspaceItemObscured: function(item, obscured) {
        if (!item || !item.addCls || !item.removeCls) {
            return;
        }

        item.removeCls('grayed-out');
        item.removeCls('workspace-obscured');

        if (!obscured) {
            return;
        }

        if (item instanceof Ext.panel.Panel) {
            item.addCls('grayed-out');
        } else {
            item.addCls('workspace-obscured');
        }
    },

    getTopWorkspacePanel: function(container, excludedPanel) {
        const workspace = container || this.getMainPanelRegion();
        let topPanel = null;
        let topZIndex = -Infinity;

        if (!workspace || !workspace.items) {
            return null;
        }

        workspace.items.each((item) => {
            if (item === excludedPanel ||
                !this.isWorkspacePanel(item) ||
                item.destroyed ||
                item.destroying ||
                item.minimizedToTaskbar ||
                (item.isVisible && !item.isVisible())) {
                return;
            }

            const el = item.rendered && item.getEl ? item.getEl() : null;
            const zIndex = el ? parseInt(el.getStyle('z-index'), 10) : 0;
            const normalizedZIndex = Number.isFinite(zIndex) ? zIndex : 0;

            if (!topPanel || normalizedZIndex >= topZIndex) {
                topPanel = item;
                topZIndex = normalizedZIndex;
            }
        });

        return topPanel;
    },

    activateTopWorkspacePanelOrClear: function(container, excludedPanel) {
        const workspace = container || this.getMainPanelRegion();
        const topPanel = this.getTopWorkspacePanel(workspace, excludedPanel);

        if (topPanel) {
            this.activateWorkspacePanel(topPanel);
            return;
        }

        this.clearWorkspaceFocusMode(workspace);
    },

    activateWorkspacePanel: function(panel) {
        if (!this.isWorkspacePanel(panel) || panel.destroyed || panel.destroying || panel.minimizedToTaskbar) {
            return;
        }

        if (panel.isVisible && !panel.isVisible()) {
            return;
        }

        this.ensureHighestZIndex();

        if (panel.isXType && panel.isXType('gridpanel') &&
            FileManagement.components.utils.GridFocusGuard &&
            FileManagement.components.utils.GridFocusGuard.clearGridFocus) {
            FileManagement.components.utils.GridFocusGuard.clearGridFocus(panel);
        }

        const container = panel.ownerCt || this.getMainPanelRegion();
        if (container && container.items) {
            const dimInactivePanels = this.getUserSetting('workspace.dimInactivePanels', true) !== false;

            if (container.addCls) {
                if (dimInactivePanels) {
                    container.addCls('workspace-focus-mode');
                } else {
                    container.removeCls('workspace-focus-mode');
                }
            }

            container.items.each(function(currentPanel) {
                const el = currentPanel && currentPanel.rendered && currentPanel.getEl ? currentPanel.getEl() : null;
                const zIndex = el ? parseInt(el.getStyle('z-index'), 10) : 0;

                if (Number.isFinite(zIndex)) {
                    window.highestZIndex = Math.max(window.highestZIndex, zIndex);
                }
            });

            const panelUtils = this;
            container.items.each(function(currentPanel) {
                if (!currentPanel || currentPanel.itemId === 'snapassist') {
                    return;
                }

                const visible = !currentPanel.isVisible || currentPanel.isVisible();
                if (!visible) {
                    panelUtils.setWorkspaceItemObscured(currentPanel, false);
                    currentPanel.removeCls('active-panel');
                    return;
                }

                if (currentPanel === panel) {
                    panelUtils.setWorkspaceItemObscured(currentPanel, false);
                    currentPanel.addCls('active-panel');
                } else if (dimInactivePanels) {
                    currentPanel.removeCls('active-panel');
                    panelUtils.setWorkspaceItemObscured(currentPanel, true);
                } else {
                    currentPanel.removeCls('active-panel');
                    panelUtils.setWorkspaceItemObscured(currentPanel, false);
                }
            });
        } else {
            this.setWorkspaceItemObscured(panel, false);
            panel.addCls('active-panel');
        }

        if (panel.rendered && panel.getEl()) {
            panel.getEl().setStyle('visibility', 'visible');
            panel.getEl().setStyle('z-index', ++window.highestZIndex);
        }
    },

    registerPanelActivation: function(panel) {
        if (!this.isWorkspacePanel(panel) || panel.workspaceActivationPrepared) {
            return;
        }

        panel.workspaceActivationPrepared = true;

        const bindActivation = function(currentPanel) {
            if (!currentPanel || currentPanel.destroyed || currentPanel.destroying || !currentPanel.rendered || !currentPanel.getEl()) {
                return;
            }

            const dom = currentPanel.getEl().dom;
            if (!dom || currentPanel.workspaceActivationBoundEl === dom) {
                return;
            }

            const activate = function() {
                FileManagement.components.utils.PanelUtils.activateWorkspacePanel(currentPanel);
            };

            currentPanel.workspaceActivationBoundEl = dom;
            currentPanel.workspaceActivationHandler = activate;
            dom.addEventListener('mousedown', activate, true);
            dom.addEventListener('touchstart', activate, true);

            currentPanel.on('destroy', function(destroyedPanel) {
                const boundEl = destroyedPanel.workspaceActivationBoundEl;
                const handler = destroyedPanel.workspaceActivationHandler;

                if (boundEl && handler) {
                    boundEl.removeEventListener('mousedown', handler, true);
                    boundEl.removeEventListener('touchstart', handler, true);
                }
            }, null, { single: true });
        };

        if (panel.rendered) {
            bindActivation(panel);
        } else {
            panel.on('afterrender', bindActivation, null, { single: true });
        }
    },

    prepareWorkspacePanel: function(panel) {
        if (!this.isWorkspacePanel(panel)) {
            return;
        }

        this.registerPanelActivation(panel);

        if (panel.preventWorkspaceResponsiveFit) {
            return;
        }

        if (panel.workspaceResponsivePrepared) {
            return;
        }

        panel.workspaceResponsivePrepared = true;

        panel.on('afterrender', function(currentPanel) {
            FileManagement.components.utils.PanelUtils.fitPanelToWorkspace(currentPanel);
        }, null, { single: true });

        panel.on('show', function(currentPanel) {
            FileManagement.components.utils.PanelUtils.fitPanelToWorkspace(currentPanel);
        });

        panel.workspaceResponsiveResizeHandler = Ext.Function.createBuffered(function(currentPanel) {
            if (!currentPanel.workspaceResponsiveApplying && FileManagement.components.utils.PanelUtils.isMobileWorkspace()) {
                FileManagement.components.utils.PanelUtils.fitPanelToWorkspace(currentPanel);
            }
        }, 80);

        panel.on('resize', function(currentPanel) {
            currentPanel.workspaceResponsiveResizeHandler(currentPanel);
        });

        if (panel.rendered) {
            this.fitPanelToWorkspace(panel);
        }
    },

    refitWorkspacePanels: function() {
        const workspace = this.getMainPanelRegion();
        if (!workspace) {
            return;
        }

        workspace.items.each(panel => {
            if (this.isWorkspacePanel(panel) && !panel.minimizedToTaskbar) {
                this.fitPanelToWorkspace(panel);
            }
        });
    },

    fitPanelToWorkspace: function(panel) {
        if (!this.isWorkspacePanel(panel) || panel.destroyed || panel.destroying || panel.minimizedToTaskbar) {
            return;
        }

        if (panel.preventWorkspaceResponsiveFit) {
            return;
        }

        const workspaceSize = this.getWorkspaceSize();
        if (!workspaceSize.width || !workspaceSize.height) {
            return;
        }

        const mobile = this.isMobileWorkspace(workspaceSize.width);
        const margin = mobile ? 0 : 12;
        const maxWidth = Math.max(this.mobileWorkspaceMinWidth, workspaceSize.width - (margin * 2));
        const maxHeight = Math.max(this.mobileWorkspaceMinHeight, workspaceSize.height - (margin * 2));

        panel.minWidth = Math.min(panel.minWidth || this.mobileWorkspaceMinWidth, maxWidth);
        panel.minHeight = Math.min(panel.minHeight || this.mobileWorkspaceMinHeight, maxHeight);

        if (panel.resizable && Ext.isObject(panel.resizable)) {
            panel.resizable.minWidth = Math.min(panel.resizable.minWidth || this.mobileWorkspaceMinWidth, maxWidth);
            panel.resizable.minHeight = Math.min(panel.resizable.minHeight || this.mobileWorkspaceMinHeight, maxHeight);
        }

        if (panel.resizer) {
            panel.resizer.minWidth = Math.min(panel.resizer.minWidth || this.mobileWorkspaceMinWidth, maxWidth);
            panel.resizer.minHeight = Math.min(panel.resizer.minHeight || this.mobileWorkspaceMinHeight, maxHeight);
        }

        if (mobile) {
            panel.addCls('workspace-mobile-panel');
            panel.mobileWorkspaceFitted = true;
            panel.workspaceResponsiveApplying = true;
            try {
                panel.setPosition(0, 0);
                panel.setSize(maxWidth, maxHeight);
                this.afterWorkspacePanelFit(panel);
            } finally {
                panel.workspaceResponsiveApplying = false;
            }
            return;
        }

        panel.removeCls('workspace-mobile-panel');

        if (panel.mobileWorkspaceFitted) {
            panel.mobileWorkspaceFitted = false;
        }

        const width = Math.min(panel.getWidth ? panel.getWidth() : panel.width || maxWidth, maxWidth);
        const height = Math.min(panel.getHeight ? panel.getHeight() : panel.height || maxHeight, maxHeight);
        const currentX = panel.getX ? panel.getX() : panel.x || margin;
        const currentY = panel.getY ? panel.getY() : panel.y || margin;
        const x = Math.max(0, Math.min(currentX, Math.max(0, workspaceSize.width - width)));
        const y = Math.max(0, Math.min(currentY, Math.max(0, workspaceSize.height - height)));

        panel.workspaceResponsiveApplying = true;
        try {
            panel.setSize(width, height);
            panel.setPosition(x, y);
            this.afterWorkspacePanelFit(panel);
        } finally {
            panel.workspaceResponsiveApplying = false;
        }
    },

    afterWorkspacePanelFit: function(panel) {
        if (panel && FileManagement.components.utils.ResponsiveGrid) {
            FileManagement.components.utils.ResponsiveGrid.prepareContainer(panel);
            FileManagement.components.utils.ResponsiveGrid.applyContainer(panel);
        }

        if (panel && panel.applyResponsiveColumns) {
            panel.applyResponsiveColumns();
        }
    },

    // Function to maximize the panel and bring it to the front
    maximizePanel: function(panel) {
        const mainPanelRegion = Ext.getCmp('mainPanelRegion');
        if (mainPanelRegion) {
            // Store the original position and size for restoration
            panel.originalConfig = {
                x: panel.getX(),
                y: panel.getY(),
                width: panel.getWidth(),
                height: panel.getHeight(),
                zIndex: panel.getEl().getStyle('z-index') // Save original z-index
            };

            // Set panel to fill mainPanelRegion
            const regionSize = mainPanelRegion.getSize();
            panel.setPosition(0, 0);
            panel.setSize(regionSize.width, regionSize.height);

            // Set a high z-index to bring the panel to the front
            panel.getEl().setStyle('z-index', ++window.highestZIndex);
            panel.maximized = true;

            this.setMaximizeToolType(panel, 'restore');
        }
    },

    // Function to restore the panel's original position, size, and z-index
    minimizePanel: function(panel) {
        if (panel.maximized) {
            // Restore the original position, size, and z-index
            panel.setPosition(panel.originalConfig.x, panel.originalConfig.y);
            panel.setSize(panel.originalConfig.width, panel.originalConfig.height);
            panel.getEl().setStyle('z-index', panel.originalConfig.zIndex);
            panel.maximized = false;

            this.setMaximizeToolType(panel, 'maximize');
            this.fitPanelToWorkspace(panel);
        }
    },

    setMaximizeToolType: function(panel, type) {
        const maximizeTool = panel.down
            ? panel.down('#maximizeTool')
            : Ext.Array.findBy(panel.tools || [], tool => tool.itemId === 'maximizeTool');

        if (maximizeTool && maximizeTool.setType) {
            maximizeTool.setType(type);
        }
    },

    getPanelToggleButton: function(panel) {
        const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
        if (!toolbar || !panel) {
            return null;
        }

        const openedButton = toolbar.openedPanels?.[panel.id] || null;
        if (openedButton) {
            return openedButton;
        }

        const openedPanels = toolbar.down ? toolbar.down('#openedPanels') : null;
        const panelButton = openedPanels
            ? openedPanels.items.findBy(button => button.panelRef === panel)
            : null;

        return panelButton || panel.refBottomToolbarButton || null;
    },

    setPanelTogglePressed: function(panel, pressed) {
        const button = this.getPanelToggleButton(panel);
        if (!button || button.destroyed || button.pressed === pressed) {
            return;
        }

        button.suppressTaskbarToggle = true;

        try {
            button.suspendEvents();
            button.setPressed(pressed);
            button.resumeEvents();
        } finally {
            button.suppressTaskbarToggle = false;
        }
    },

    minimizeToTaskbar: function(panel) {
        if (!panel || panel.destroyed || panel.destroying) {
            return;
        }

        this.blurActiveElementInside(panel);

        const wasAlreadyMinimized = !!panel.minimizedToTaskbar;
        panel.minimizedToTaskbar = true;

        panel.taskbarRestoreState = panel.taskbarRestoreState || {
            x: panel.getX(),
            y: panel.getY(),
            width: panel.getWidth(),
            height: panel.getHeight(),
            zIndex: panel.rendered && panel.getEl() ? panel.getEl().getStyle('z-index') : null
        };

        if (wasAlreadyMinimized) {
            this.setPanelTogglePressed(panel, false);
            this.updateNavigationPanelList();
            return;
        }

        if (panel.maximized) {
            this.minimizePanel(panel);
        }

        this.setPanelTogglePressed(panel, false);
        if (this.getUserSetting('workspace.enablePanelAnimations', true) !== false) {
            this.animatePanelToTaskbar(panel);
        }

        if (panel.rendered && panel.getEl()) {
            panel.setPosition(-10000, -10000);
            panel.getEl().setStyle('visibility', 'hidden');
        }

        this.activateTopWorkspacePanelOrClear(panel.ownerCt, panel);
        this.updateNavigationPanelList();
    },

    blurActiveElementInside: function(panel) {
        if (!panel || !panel.rendered || !panel.getEl()) {
            return;
        }

        const activeElement = document.activeElement;
        const panelDom = panel.getEl().dom;

        if (activeElement && panelDom && panelDom.contains(activeElement) && activeElement.blur) {
            activeElement.blur();
        }
    },

    animatePanelToTaskbar: function(panel) {
        const targetButton = this.getPanelToggleButton(panel);
        if (!panel || !panel.rendered || !panel.getEl() || !targetButton || targetButton.destroyed || !targetButton.rendered || !targetButton.getEl()) {
            return;
        }

        const startBox = panel.getEl().getBox();
        const targetBox = targetButton.getEl().getBox();
        const proxy = this.createPanelAnimationProxy(panel, 0.88);
        if (!proxy) {
            return;
        }

        proxy.setBox(startBox);
        proxy.animate({
            duration: 260,
            easing: 'easeOut',
            to: {
                x: targetBox.x,
                y: targetBox.y,
                width: Math.max(targetBox.width, 36),
                height: Math.max(targetBox.height, 22),
                opacity: 0.12
            },
            callback: function() {
                proxy.destroy();
            }
        });
    },

    animatePanelFromTaskbar: function(panel, finalBox, callback) {
        const sourceButton = this.getPanelToggleButton(panel);
        if (!panel || !finalBox || !sourceButton || sourceButton.destroyed || !sourceButton.rendered || !sourceButton.getEl()) {
            if (callback) {
                callback();
            }
            return;
        }

        const sourceBox = sourceButton.getEl().getBox();
        const proxy = this.createPanelAnimationProxy(panel, 0.12);
        if (!proxy) {
            if (callback) {
                callback();
            }
            return;
        }

        proxy.setBox({
            x: sourceBox.x,
            y: sourceBox.y,
            width: Math.max(sourceBox.width, 36),
            height: Math.max(sourceBox.height, 22)
        });

        proxy.animate({
            duration: 240,
            easing: 'easeOut',
            to: {
                x: finalBox.x,
                y: finalBox.y,
                width: finalBox.width,
                height: finalBox.height,
                opacity: 0.88
            },
            callback: function() {
                proxy.destroy();
                if (callback) {
                    callback();
                }
            }
        });
    },

    createPanelAnimationProxy: function(panel, opacity) {
        if (!panel) {
            return null;
        }

        const title = Ext.String.htmlEncode(panel.getTitle ? panel.getTitle() : panel.title || 'Panel');

        return Ext.getBody().createChild({
            cls: 'x-panel x-panel-default x-window x-window-default',
            style: {
                position: 'absolute',
                pointerEvents: 'none',
                overflow: 'hidden',
                opacity: opacity,
                zIndex: ++window.highestZIndex,
                boxShadow: '0 8px 18px rgba(42, 86, 132, 0.28)'
            },
            html: [
                '<div class="x-panel-header x-header x-panel-header-default x-horizontal x-panel-header-horizontal x-panel-header-default-horizontal" style="height: 24px;">',
                    '<div class="x-title x-panel-header-title x-panel-header-title-default" style="padding: 4px 8px; font-weight: bold;">',
                        title,
                    '</div>',
                '</div>',
                '<div class="x-panel-body x-panel-body-default" style="height: 100%;"></div>'
            ].join('')
        });
    },

    restoreFromTaskbar: function(panel) {
        if (!panel || panel.destroyed || panel.destroying) {
            return;
        }

        const finalizeRestore = () => {
            if (!panel || panel.destroyed || panel.destroying) {
                return;
            }

            if (panel.rendered && panel.getEl()) {
                panel.getEl().setStyle('visibility', 'visible');
            }

            this.bringPanelForward(panel);
            this.setPanelTogglePressed(panel, true);
            this.updateNavigationPanelList();
        };

        const mainPanelRegion = this.getMainPanelRegion();
        if (mainPanelRegion && !panel.ownerCt) {
            mainPanelRegion.add(panel);
        }

        this.prepareWorkspacePanel(panel);

        const shouldAnimate = !!panel.taskbarRestoreState &&
            !!this.getPanelToggleButton(panel) &&
            this.getUserSetting('workspace.enablePanelAnimations', true) !== false;
        panel.minimizedToTaskbar = false;
        panel.show();

        if (panel.taskbarRestoreState) {
            panel.setPosition(panel.taskbarRestoreState.x, panel.taskbarRestoreState.y);
            panel.setSize(panel.taskbarRestoreState.width, panel.taskbarRestoreState.height);
            if (panel.rendered && panel.getEl()) {
                panel.getEl().setStyle('visibility', shouldAnimate ? 'hidden' : 'visible');
                if (panel.taskbarRestoreState.zIndex) {
                    panel.getEl().setStyle('z-index', panel.taskbarRestoreState.zIndex);
                }
            }
            panel.taskbarRestoreState = null;
        } else if (panel.rendered && panel.getEl()) {
            panel.getEl().setStyle('visibility', 'visible');
        }

        this.fitPanelToWorkspace(panel);

        if (shouldAnimate && panel.rendered && panel.getEl()) {
            this.animatePanelFromTaskbar(panel, panel.getEl().getBox(), finalizeRestore);
            this.setPanelTogglePressed(panel, true);
            this.updateNavigationPanelList();
            return;
        }

        finalizeRestore();
    },

    // Function to handle drag end and constrain position
    onMouseUp: function(panel, dragEvent, dragContext) {
        if (!panel || panel.destroyed || panel.destroying || !panel.rendered || !panel.getEl()) {
            return;
        }

        const el = panel.getEl().dom;
        const viewportHeight = Ext.Element.getViewportHeight(); // Total viewport height
        const toolbarHeight = Ext.ComponentQuery.query('#userToolbar')[0].getHeight(); // Get toolbar height

        if (el) {
            // Get final position after drag ends
            let finalLeft = parseInt(el.style.left, 10);
            let finalTop = parseInt(el.style.top, 10);

            // Constrain to the left boundary
            if (finalLeft <= 0) {
                finalLeft = 0;
            }

            // Constrain to the top boundary (not necessary here but included for consistency)
            if (finalTop <= 0) {
                finalTop = 0;
            }

            // Constrain to the bottom boundary to avoid overlapping the toolbar
            const maxTop = viewportHeight - toolbarHeight - el.offsetHeight;
            if (finalTop >= maxTop) {
                finalTop = maxTop;
            }

            // Apply the constrained position and update z-index
            el.style.left = `${finalLeft}px`;
            el.style.top = `${finalTop}px`;
            el.style.zIndex = ++window.highestZIndex;
        }

        if (this.isMobileWorkspace()) {
            this.fitPanelToWorkspace(panel);
        } else {
            const snapAssist = FileManagement.components.utils.SnapAssist.getActive();
            if (snapAssist) {
                snapAssist.onPanelDrop(panel, dragEvent, dragContext);
            }
        }

        this.restoreIframePanelPointerEvents();
    },

    // Close panel functionality
    closePanel: function(panel) {
        const parent = panel.up(); // Get the parent container
        if (parent) {
            parent.remove(panel, true); // Remove the panel from its parent
        }
    },

    show: function(panel) {
        this.updateNavigationPanelList();
    },

    hide: function() {
        this.updateNavigationPanelList();
    },

    destroy: function(panel) {
        const container = panel ? panel.ownerCt : null;

        // Clean up store and remove event listeners
        if (typeof panel.getStore !== "undefined" && panel.getStore()) {
            panel.getStore().removeAll();  // Clears store data to free up memory
            panel.getStore().clearListeners();
        }

        this.activateTopWorkspacePanelOrClear(container, panel);
        this.updateNavigationPanelList();
    },

    onClick: function (panel) {
        this.activateWorkspacePanel(panel);
    },

    updateNavigationPanelList: function() {
        const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
        if (navPanel) {
            navPanel.refreshPanelList();
        }

        this.saveOpenPanelState();
    },

    getMainPanelRegion: function() {
        return Ext.getCmp('mainPanelRegion');
    },

    getFileExplorerToggleButton: function() {
        const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
        return toolbar ? toolbar.down('#fileExplorerToggle') : null;
    },

    getFileGridByMode: function(mode = 'files') {
        const normalizedMode = mode === 'sharedWithMe' || mode === 'sharedByMe' ? mode : 'files';
        return Ext.Array.findBy(Ext.ComponentQuery.query('filegrid'), function(grid) {
            const gridMode = grid.listMode || 'files';
            return gridMode === normalizedMode;
        }) || null;
    },

    getPrimaryFileGrid: function() {
        return this.getFileGridByMode('files');
    },

    setFileExplorerTogglePressed: function(pressed) {
        const button = this.getFileExplorerToggleButton();
        if (!button || button.destroyed || button.pressed === pressed) {
            return;
        }

        button.suppressTaskbarToggle = true;

        try {
            button.suspendEvents();
            button.setPressed(pressed);
            button.resumeEvents();
        } finally {
            button.suppressTaskbarToggle = false;
        }
    },

    bringPanelForward: function(panel) {
        if (!panel) {
            return;
        }

        this.prepareWorkspacePanel(panel);
        panel.show();
        panel.minimizedToTaskbar = false;
        this.fitPanelToWorkspace(panel);

        if (panel.rendered && panel.getEl()) {
            panel.getEl().setStyle('visibility', 'visible');
        } else {
            panel.on('afterrender', function(currentPanel) {
                FileManagement.components.utils.PanelUtils.activateWorkspacePanel(currentPanel);
            }, null, { single: true });
        }

        this.activateWorkspacePanel(panel);
    },

    createFileGridPanel: function(mode, options = {}) {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        const normalizedMode = mode === 'sharedWithMe' || mode === 'sharedByMe' ? mode : 'files';
        const toggleButton = normalizedMode === 'files'
            ? (options.refBottomToolbarButton || this.getFileExplorerToggleButton())
            : null;
        const fileGridStore = Ext.create('FileManagement.components.stores.FileGridStore', {
            autoLoad: false
        });
        const modeOffset = normalizedMode === 'sharedWithMe' ? 18 : normalizedMode === 'sharedByMe' ? 36 : 0;
        const titleByMode = {
            files: 'Files Explorer',
            sharedWithMe: 'Shared With Me',
            sharedByMe: 'Shared By Me'
        };
        const iconByMode = {
            files: 'fa fa-folder-open',
            sharedWithMe: 'fa fa-share-nodes',
            sharedByMe: 'fa fa-share-from-square'
        };

        const fileGridPanel = Ext.create('FileManagement.components.grids.FileGrid', {
            xtype: 'filegrid',
            store: fileGridStore,
            title: titleByMode[normalizedMode],
            iconCls: iconByMode[normalizedMode],
            listMode: normalizedMode,
            sharedMode: normalizedMode === 'sharedWithMe',
            sharedByMeMode: normalizedMode === 'sharedByMe',
            x: options.x || (36 + modeOffset),
            y: options.y || (34 + modeOffset),
            refBottomToolbarButton: toggleButton || null,
            currentFolderPath: [],
            currentFolder: null,
            currentFolderId: null
        });

        mainPanelRegion.add(fileGridPanel);
        this.prepareWorkspacePanel(fileGridPanel);

        if (fileGridPanel.setListMode) {
            fileGridPanel.setListMode(normalizedMode, { skipLoad: true });
        }

        if (fileGridPanel.loadFiles) {
            fileGridPanel.loadFiles();
        }

        if (normalizedMode !== 'files') {
            const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
            if (toolbar && toolbar.addPanelToggleButton) {
                toolbar.addPanelToggleButton(
                    fileGridPanel,
                    titleByMode[normalizedMode],
                    iconByMode[normalizedMode]
                );
            }
        }

        this.bringPanelForward(fileGridPanel);
        this.updateNavigationPanelList();

        return fileGridPanel;
    },

    openFileGridMode: function(mode, options = {}) {
        const normalizedMode = mode === 'sharedWithMe' || mode === 'sharedByMe' ? mode : 'files';
        let fileGridPanel = this.getFileGridByMode(normalizedMode);

        if (!fileGridPanel) {
            fileGridPanel = this.createFileGridPanel(normalizedMode, options);
        } else {
            if (normalizedMode === 'files') {
                const toggleButton = options.refBottomToolbarButton || this.getFileExplorerToggleButton();
                if (toggleButton) {
                    fileGridPanel.refBottomToolbarButton = toggleButton;
                }
            }

            this.bringPanelForward(fileGridPanel);
            this.updateNavigationPanelList();
        }

        if (normalizedMode === 'files') {
            this.setFileExplorerTogglePressed(true);
        } else {
            this.setPanelTogglePressed(fileGridPanel, true);
        }

        return fileGridPanel;
    },

    openFileExplorer: function(options = {}) {
        return this.openFileGridMode('files', options);
    },

    openSharedWithMe: function() {
        return this.openFileGridMode('sharedWithMe');
    },

    openSharedByMe: function() {
        return this.openFileGridMode('sharedByMe');
    },

    openUploadForm: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        const fileGrid = this.openFileExplorer();

        let uploadForm = Ext.ComponentQuery.query('fileuploadform')[0];

        if (!uploadForm) {
            uploadForm = Ext.create('FileManagement.components.forms.FileUploadForm', {
                targetGrid: fileGrid || null
            });
            mainPanelRegion.add(uploadForm);
            this.prepareWorkspacePanel(uploadForm);
        } else {
            uploadForm.targetGrid = fileGrid || uploadForm.targetGrid || null;
        }

        this.bringPanelForward(uploadForm);
        this.updateNavigationPanelList();

        return uploadForm;
    },

    openUserSettings: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        let settingsPanel = Ext.ComponentQuery.query('usersettingspanel')[0];

        if (!settingsPanel) {
            settingsPanel = Ext.create('FileManagement.components.settings.UserSettingsPanel');
            mainPanelRegion.add(settingsPanel);
            this.prepareWorkspacePanel(settingsPanel);

            const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
            if (toolbar && toolbar.addPanelToggleButton) {
                toolbar.addPanelToggleButton(settingsPanel, 'Settings', 'fa fa-gear');
            }
        }

        this.bringPanelForward(settingsPanel);
        this.setPanelTogglePressed(settingsPanel, true);
        this.updateNavigationPanelList();

        return settingsPanel;
    },

    openActivityCenter: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        let activityPanel = Ext.ComponentQuery.query('activitycenterpanel')[0];

        if (activityPanel) {
            this.bringPanelForward(activityPanel);
            this.setPanelTogglePressed(activityPanel, true);
            this.updateNavigationPanelList();

            if (activityPanel.reloadActivities) {
                activityPanel.reloadActivities();
            }

            return activityPanel;
        }

        Ext.require('FileManagement.components.status.ActivityCenterPanel', function() {
            const panelUtils = FileManagement.components.utils.PanelUtils;
            const workspace = panelUtils.getMainPanelRegion();

            if (!workspace || workspace.destroyed || workspace.destroying) {
                return;
            }

            let panel = Ext.ComponentQuery.query('activitycenterpanel')[0];

            if (!panel) {
                panel = Ext.create('FileManagement.components.status.ActivityCenterPanel', {
                    x: 24,
                    y: 24
                });
                workspace.add(panel);
                panelUtils.prepareWorkspacePanel(panel);

                const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
                if (toolbar && toolbar.addPanelToggleButton) {
                    toolbar.addPanelToggleButton(panel, 'Activity Center', 'fa fa-list-check');
                }
            }

            panelUtils.bringPanelForward(panel);
            panelUtils.setPanelTogglePressed(panel, true);
            panelUtils.updateNavigationPanelList();

            if (panel.reloadActivities) {
                panel.reloadActivities();
            }
        });

        return null;
    },

    openStorageInsights: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        let insightsPanel = Ext.ComponentQuery.query('storageinsightspanel')[0];

        if (insightsPanel) {
            this.bringPanelForward(insightsPanel);
            this.setPanelTogglePressed(insightsPanel, true);
            this.updateNavigationPanelList();

            if (insightsPanel.loadInsights) {
                insightsPanel.loadInsights(false);
            }

            return insightsPanel;
        }

        Ext.require('FileManagement.components.storage.StorageInsightsPanel', function() {
            const panelUtils = FileManagement.components.utils.PanelUtils;
            const workspace = panelUtils.getMainPanelRegion();

            if (!workspace || workspace.destroyed || workspace.destroying) {
                return;
            }

            let panel = Ext.ComponentQuery.query('storageinsightspanel')[0];

            if (!panel) {
                panel = Ext.create('FileManagement.components.storage.StorageInsightsPanel', {
                    x: 28,
                    y: 28
                });
                workspace.add(panel);
                panelUtils.prepareWorkspacePanel(panel);

                const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
                if (toolbar && toolbar.addPanelToggleButton) {
                    toolbar.addPanelToggleButton(panel, 'Storage Insights', 'fa fa-chart-pie');
                }
            }

            panelUtils.bringPanelForward(panel);
            panelUtils.setPanelTogglePressed(panel, true);
            panelUtils.updateNavigationPanelList();
        });

        return null;
    },

    openOrganizationAdmin: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return null;
        }

        let organizationPanel = Ext.ComponentQuery.query('organizationadminpanel')[0];

        if (organizationPanel) {
            this.bringPanelForward(organizationPanel);
            this.setPanelTogglePressed(organizationPanel, true);
            this.updateNavigationPanelList();

            if (organizationPanel.loadContext) {
                organizationPanel.loadContext();
            }

            return organizationPanel;
        }

        Ext.require('FileManagement.components.organizations.OrganizationAdminPanel', function() {
            const panelUtils = FileManagement.components.utils.PanelUtils;
            const workspace = panelUtils.getMainPanelRegion();

            if (!workspace || workspace.destroyed || workspace.destroying) {
                return;
            }

            let panel = Ext.ComponentQuery.query('organizationadminpanel')[0];

            if (!panel) {
                panel = Ext.create('FileManagement.components.organizations.OrganizationAdminPanel', {
                    x: 34,
                    y: 34
                });
                workspace.add(panel);
                panelUtils.prepareWorkspacePanel(panel);

                const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
                if (toolbar && toolbar.addPanelToggleButton) {
                    toolbar.addPanelToggleButton(panel, 'Organization Admin', 'fa fa-building');
                }
            }

            panelUtils.bringPanelForward(panel);
            panelUtils.setPanelTogglePressed(panel, true);
            panelUtils.updateNavigationPanelList();
        });

        return null;
    },

    promptCreateFolder: function() {
        const fileGrid = this.openFileExplorer();
        if (!fileGrid) {
            return;
        }

        Ext.Msg.prompt('New Folder', 'Enter folder name:', function(btn, folderName) {
            if (btn !== 'ok' || !folderName) {
                return;
            }

            Ext.Ajax.request({
                url: FileManagementEnv.apiUrl('/api/files/create-folder'),
                method: 'POST',
                jsonData: {
                    name: folderName,
                    parentId: fileGrid.currentFolderId || null,
                    workspaceId: fileGrid.getWorkspaceId ? fileGrid.getWorkspaceId() : ''
                },
                success: function() {
                    Ext.Msg.alert('Success', 'Folder created successfully.');
                    fileGrid.getStore().reload();
                    FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                },
                failure: function(response) {
                    const payload = response.responseText ? Ext.decode(response.responseText, true) : null;
                    Ext.Msg.alert('Error', payload?.message || payload?.error || 'Failed to create folder');
                }
            });
        });
    },

    showQuickSearch: function() {
        Ext.require('FileManagement.components.utils.KeyboardShortcuts', function() {
            FileManagement.components.utils.KeyboardShortcuts.showQuickSearch();
        });
    },

    showHomeDashboard: function() {
        const mainPanelRegion = this.getMainPanelRegion();
        if (!mainPanelRegion) {
            return null;
        }

        let dashboard = mainPanelRegion.down('homedashboard');

        if (!dashboard) {
            dashboard = mainPanelRegion.add({
                xtype: 'homedashboard',
                itemId: 'homeDashboard',
                x: 0,
                y: 0
            });
        }

        this.focusWorkspaceBackground(mainPanelRegion);

        if (dashboard.fitToWorkspace) {
            dashboard.fitToWorkspace(mainPanelRegion);
        }

        if (dashboard.loadSummary) {
            dashboard.loadSummary();
        }

        return dashboard;
    },

    refreshHomeDashboard: function() {
        const dashboard = Ext.ComponentQuery.query('homedashboard')[0];
        if (dashboard && dashboard.loadSummary) {
            dashboard.loadSummary();
        }
    },

    toggleMaximize: function(panel) {
        if (!panel.maximized) {
            this.maximizePanel(panel);
        } else {
            this.minimizePanel(panel);
        }
    },

    onDrag: function(panel, dragEvent, dragContext) {
        const snapAssist = FileManagement.components.utils.SnapAssist.getActive();
        if (snapAssist) {
            snapAssist.onPanelDrag(panel, dragEvent, dragContext);
        }

        // Mask all panels with iframes
        const iframePanels = Ext.ComponentQuery.query('panel[cls~=iframe-container]');
        iframePanels.forEach(panel => {
            const el = panel.items.items[0];
            if (el) {
                // Add a mask to the panel's element
                el.setStyle({
                    pointerEvents: 'none'
                });
            }
        });
    },

    restoreIframePanelPointerEvents: function() {
        const iframePanels = Ext.ComponentQuery.query('panel[cls~=iframe-container]');

        iframePanels.forEach(panel => {
            if (!panel || panel.destroyed || !panel.items || !panel.items.items.length) {
                return;
            }

            panel.items.items.forEach(item => {
                const itemEl = item && item.getEl ? item.getEl() : null;
                const dom = itemEl && itemEl.dom ? itemEl.dom : null;

                if (!itemEl || !dom) {
                    return;
                }

                itemEl.setStyle('pointer-events', 'auto');

                if (dom.tagName && dom.tagName.toLowerCase() === 'iframe') {
                    dom.style.pointerEvents = 'auto';
                }
            });
        });
    },

    applyZIndexHighlighting: function(container) {
        this.registerWorkspaceBackgroundActivation(container);

        // Function to handle highlighting logic
        const updateHighlighting = (activePanel) => {
            if (this.isWorkspacePanel(activePanel)) {
                this.activateWorkspacePanel(activePanel);
                return;
            }

            this.focusWorkspaceBackground(container);
        };

        // Add listeners to all existing panels
        container.items.each(panel => {
            if (panel instanceof Ext.panel.Panel) {
                this.prepareWorkspacePanel(panel);

                panel.on('afterrender', () => {
                    // Ensure grayout is updated when a panel is closed
                    panel.on('close', () => {
                        Ext.defer(() => {
                            this.activateTopWorkspacePanelOrClear(container, panel);
                        }, 0);
                    });
                });
            }
        });

        // Handle dynamically added panels
        container.on('add', (parent, panel) => {
            if (panel instanceof Ext.panel.Panel) {
                this.prepareWorkspacePanel(panel);

                panel.on('afterrender', () => {
                    panel.on('close', () => {
                        Ext.defer(() => {
                            this.activateTopWorkspacePanelOrClear(container, panel);
                        }, 0);
                    });
                });
            }
        });

        // Initial highlight
        const topPanel = this.getTopWorkspacePanel(container);
        if (topPanel) {
            updateHighlighting(topPanel);
        } else {
            this.focusWorkspaceBackground(container);
        }
    },

    updateZIndexHighlighting: function(container, activePanel) {
        if (this.isWorkspacePanel(activePanel)) {
            this.activateWorkspacePanel(activePanel);
            return;
        }

        this.focusWorkspaceBackground(container);
    }
});
