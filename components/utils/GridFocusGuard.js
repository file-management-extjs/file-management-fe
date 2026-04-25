Ext.define('FileManagement.components.utils.GridFocusGuard', {
    singleton: true,

    initialized: false,

    init: function() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.patchCellContext();
        this.patchNavigationModels();
        this.patchViews();
        this.patchGridLifecycle();
        this.patchExistingGrids();
    },

    isStaleFocusError: function(error) {
        const message = error && error.message ? error.message : '';
        return message.indexOf('isModel') !== -1 ||
            message.indexOf('getDefaultFocusPosition') !== -1 ||
            message.indexOf("reading 'record'") !== -1 ||
            message.indexOf('reading "record"') !== -1 ||
            message.indexOf("reading 'clone'") !== -1 ||
            message.indexOf('reading "clone"') !== -1 ||
            message.indexOf("reading 'view'") !== -1 ||
            message.indexOf('reading "view"') !== -1 ||
            message.indexOf("reading 'isCollapsedPlaceholder'") !== -1 ||
            message.indexOf('reading "isCollapsedPlaceholder"') !== -1;
    },

    patchCellContext: function() {
        const cellContextClass = Ext.grid && Ext.grid.CellContext;
        if (!cellContextClass || cellContextClass.fileManagementNullRowPatchApplied) {
            return;
        }

        cellContextClass.fileManagementNullRowPatchApplied = true;

        const originalSetRow = cellContextClass.prototype.setRow;

        cellContextClass.prototype.setRow = function(row) {
            if (row == null) {
                this.record = null;
                this.rowIdx = -1;
                return this;
            }

            return originalSetRow.apply(this, arguments);
        };
    },

    patchNavigationModels: function() {
        const me = this;
        const classes = [];

        if (Ext.view && Ext.view.NavigationModel) {
            classes.push(Ext.view.NavigationModel);
        }

        if (Ext.grid && Ext.grid.NavigationModel) {
            classes.push(Ext.grid.NavigationModel);
        }

        Ext.Array.forEach(classes, function(navigationClass) {
            if (!navigationClass || navigationClass.fileManagementGridFocusGuardApplied) {
                return;
            }

            navigationClass.fileManagementGridFocusGuardApplied = true;

            me.wrapNavigationMethod(navigationClass, 'getDefaultFocusPosition', null);
            me.wrapNavigationMethod(navigationClass, 'getPosition', null);
            me.wrapNavigationMethod(navigationClass, 'onCellClick', false);
            me.wrapNavigationMethod(navigationClass, 'onFocusEnter', false);
            me.wrapNavigationMethod(navigationClass, 'setPosition', null);
        });
    },

    wrapNavigationMethod: function(navigationClass, methodName, fallbackValue) {
        const me = this;
        const originalMethod = navigationClass.prototype[methodName];

        if (!Ext.isFunction(originalMethod) || originalMethod.fileManagementFocusGuardWrapped) {
            return;
        }

        const wrappedMethod = function() {
            return me.executeNavigationMethod(this, originalMethod, methodName, fallbackValue, arguments);
        };

        wrappedMethod.fileManagementFocusGuardWrapped = true;
        navigationClass.prototype[methodName] = wrappedMethod;
    },

    wrapNavigationInstanceMethod: function(navigationModel, methodName, fallbackValue) {
        const me = this;

        if (!navigationModel || navigationModel[`fileManagementFocusGuard_${methodName}`]) {
            return;
        }

        const originalMethod = navigationModel[methodName];

        if (!Ext.isFunction(originalMethod)) {
            return;
        }

        navigationModel[`fileManagementFocusGuard_${methodName}`] = true;
        navigationModel[methodName] = function() {
            return me.executeNavigationMethod(this, originalMethod, methodName, fallbackValue, arguments);
        };
    },

    executeNavigationMethod: function(navigationModel, originalMethod, methodName, fallbackValue, args) {
        const callArgs = Array.prototype.slice.call(args);

        if (methodName === 'getDefaultFocusPosition') {
            const view = navigationModel.view ||
                callArgs[0] && callArgs[0].view ||
                callArgs[0] && callArgs[0].ownerGrid && callArgs[0].ownerGrid.getView && callArgs[0].ownerGrid.getView() ||
                null;

            this.sanitizeNavigationState(navigationModel, view);

            if (!this.hasFocusableRows(view)) {
                this.clearNavigationFocus(navigationModel);
                return fallbackValue;
            }
        }

        if (methodName === 'onFocusEnter') {
            const focusEvent = callArgs[0] || {};
            const view = navigationModel.view ||
                focusEvent.toComponent && focusEvent.toComponent.getView && focusEvent.toComponent.getView() ||
                focusEvent.toComponent && focusEvent.toComponent.ownerGrid && focusEvent.toComponent.ownerGrid.getView && focusEvent.toComponent.ownerGrid.getView() ||
                null;

            this.sanitizeNavigationState(navigationModel, view);
        }

        if (methodName === 'onCellClick') {
            const view = callArgs[0] || navigationModel.view;
            const event = callArgs[6];
            const eventPosition = event && event.position;

            this.ensureNavigationPosition(navigationModel, view);

            if (!this.isUsableCellPosition(eventPosition)) {
                this.clearNavigationFocus(navigationModel);
                return fallbackValue;
            }

            if (view && view.actionableMode && !this.isUsableCellPosition(view.actionPosition)) {
                view.actionPosition = eventPosition;
            }
        }

        if (methodName === 'setPosition' && callArgs[0] == null) {
            this.ensureNavigationPosition(navigationModel, navigationModel.view || callArgs[2] && callArgs[2].view);
            this.clearNavigationFocus(navigationModel);
            return fallbackValue;
        }

        if (
            methodName === 'setPosition' &&
            callArgs[0] &&
            typeof callArgs[0] === 'object' &&
            callArgs[0].view === null
        ) {
            const fallbackView = navigationModel.view || callArgs[2] && callArgs[2].view;
            if (fallbackView && callArgs[0].isCellContext) {
                callArgs[0].view = fallbackView;
            } else {
                this.clearNavigationFocus(navigationModel);
                return fallbackValue;
            }
        }

        if (methodName === 'setPosition') {
            const candidatePosition = callArgs[0];
            const fallbackView = candidatePosition && candidatePosition.view || callArgs[2] && callArgs[2].view || navigationModel.view;

            this.ensureNavigationPosition(navigationModel, fallbackView);
            this.sanitizeNavigationState(navigationModel, fallbackView);

            if (candidatePosition && candidatePosition.isCellContext && !this.isCompleteCellPosition(candidatePosition)) {
                this.clearNavigationFocus(navigationModel);
                return fallbackValue;
            }
        }

        try {
            return originalMethod.apply(navigationModel, callArgs);
        } catch (error) {
            if (this.isStaleFocusError(error)) {
                this.clearNavigationFocus(navigationModel);
                return fallbackValue;
            }

            throw error;
        }
    },

    patchNavigationInstance: function(navigationModel) {
        if (!navigationModel || navigationModel.fileManagementFocusGuardInstanceApplied) {
            return;
        }

        navigationModel.fileManagementFocusGuardInstanceApplied = true;
        this.wrapNavigationInstanceMethod(navigationModel, 'getDefaultFocusPosition', null);
        this.wrapNavigationInstanceMethod(navigationModel, 'getPosition', null);
        this.wrapNavigationInstanceMethod(navigationModel, 'onCellClick', false);
        this.wrapNavigationInstanceMethod(navigationModel, 'onFocusEnter', false);
        this.wrapNavigationInstanceMethod(navigationModel, 'setPosition', null);
    },

    isUsableCellPosition: function(position) {
        return !!position &&
            position.isCellContext &&
            !!position.view &&
            Ext.isFunction(position.isEqual) &&
            Ext.isFunction(position.clone);
    },

    isCompleteCellPosition: function(position) {
        if (!this.isUsableCellPosition(position) || !position.record || !position.column) {
            return false;
        }

        const view = position.view;
        const dataSource = view.dataSource || view.store;
        const columnManager = view.getVisibleColumnManager
            ? view.getVisibleColumnManager()
            : view.getColumnManager ? view.getColumnManager() : null;

        if (dataSource && dataSource.indexOf && dataSource.indexOf(position.record) === -1) {
            return false;
        }

        if (columnManager && columnManager.indexOf && columnManager.indexOf(position.column) === -1) {
            return false;
        }

        return true;
    },

    hasFocusableRows: function(view) {
        if (!view || view.destroyed || view.destroying) {
            return false;
        }

        const dataSource = view.dataSource || view.store;
        const count = dataSource && Ext.isFunction(dataSource.getCount)
            ? dataSource.getCount()
            : dataSource && Ext.isFunction(dataSource.getRange)
                ? dataSource.getRange().length
                : 0;

        if (count <= 0) {
            return false;
        }

        if (view.all && Ext.isFunction(view.all.getCount) && view.all.getCount() <= 0) {
            return false;
        }

        return true;
    },

    ensureNavigationPosition: function(navigationModel, view) {
        if (!navigationModel || !Ext.grid || !Ext.grid.CellContext) {
            return null;
        }

        const fallbackView = view || navigationModel.view || null;

        if (!navigationModel.position || !navigationModel.position.isCellContext) {
            if (!fallbackView) {
                return null;
            }

            navigationModel.position = new Ext.grid.CellContext(fallbackView);
        }

        if (!navigationModel.position.view && fallbackView) {
            navigationModel.position.view = fallbackView;
        }

        return navigationModel.position;
    },

    resetCellContext: function(position, view) {
        if (!position || !position.isCellContext || !position.setAll) {
            return null;
        }

        position.setAll(view || position.view || null, null, null, null, null);
        return position;
    },

    sanitizeNavigationState: function(navigationModel, view) {
        if (!navigationModel) {
            return;
        }

        const fallbackView = view || navigationModel.view || null;

        this.ensureNavigationPosition(navigationModel, fallbackView);

        if (navigationModel.lastFocused && !this.isCompleteCellPosition(navigationModel.lastFocused)) {
            navigationModel.lastFocused = null;
        }

        if (navigationModel.previousPosition && !this.isCompleteCellPosition(navigationModel.previousPosition)) {
            this.resetCellContext(navigationModel.previousPosition, navigationModel.previousPosition.view || fallbackView);
        }

        if (fallbackView && fallbackView.actionPosition && !this.isCompleteCellPosition(fallbackView.actionPosition)) {
            this.resetCellContext(fallbackView.actionPosition, fallbackView);
        }
    },

    patchViews: function() {
        const me = this;
        const classes = [];

        if (Ext.view && Ext.view.AbstractView) {
            classes.push(Ext.view.AbstractView);
        }

        if (Ext.view && Ext.view.Table) {
            classes.push(Ext.view.Table);
        }

        Ext.Array.forEach(classes, function(viewClass) {
            if (!viewClass || viewClass.fileManagementFocusGuardApplied) {
                return;
            }

            viewClass.fileManagementFocusGuardApplied = true;
            me.wrapViewMethod(viewClass, 'saveFocusState', null);
            me.wrapViewMethod(viewClass, 'restoreFocusState', null);
            me.wrapViewMethod(viewClass, 'refresh', null);
        });
    },

    wrapViewMethod: function(viewClass, methodName, fallbackValue) {
        const me = this;
        const originalMethod = viewClass.prototype[methodName];

        if (!Ext.isFunction(originalMethod) || originalMethod.fileManagementFocusGuardWrapped) {
            return;
        }

        const wrappedMethod = function() {
            try {
                return originalMethod.apply(this, arguments);
            } catch (error) {
                if (me.isStaleFocusError(error)) {
                    const grid = this.ownerGrid || this.ownerCt || null;
                    me.clearGridFocus(grid);
                    return fallbackValue;
                }

                throw error;
            }
        };

        wrappedMethod.fileManagementFocusGuardWrapped = true;
        viewClass.prototype[methodName] = wrappedMethod;
    },

    patchGridLifecycle: function() {
        const me = this;

        if (!Ext.grid || !Ext.grid.Panel || Ext.grid.Panel.fileManagementFocusLifecyclePatchApplied) {
            return;
        }

        Ext.grid.Panel.fileManagementFocusLifecyclePatchApplied = true;

        Ext.override(Ext.grid.Panel, {
            initComponent: function() {
                this.callParent(arguments);
                me.attachGrid(this);
            }
        });
    },

    patchExistingGrids: function() {
        const grids = Ext.ComponentQuery ? Ext.ComponentQuery.query('gridpanel') : [];

        Ext.Array.forEach(grids, (grid) => {
            this.attachGrid(grid);
        });
    },

    attachGrid: function(grid) {
        if (!grid || grid.fileManagementFocusGuardAttached) {
            return;
        }

        const me = this;
        const clearFocus = function() {
            me.clearGridFocus(grid);
        };

        grid.fileManagementFocusGuardAttached = true;
        me.patchNavigationInstance(grid.getNavigationModel ? grid.getNavigationModel() : null);

        grid.on({
            afterrender: function(currentGrid) {
                me.attachView(currentGrid);
                me.patchNavigationInstance(currentGrid.getNavigationModel ? currentGrid.getNavigationModel() : null);
            },
            beforerender: clearFocus,
            beforedestroy: clearFocus,
            reconfigure: function(currentGrid, store) {
                me.clearGridFocus(currentGrid);
                me.attachStore(currentGrid, store || currentGrid.getStore());
            }
        });

        me.attachView(grid);
        me.attachStore(grid, grid.getStore ? grid.getStore() : null);
    },

    attachView: function(grid) {
        const view = grid && grid.getView ? grid.getView() : null;
        if (!view || view.fileManagementFocusGuardAttached) {
            return;
        }

        const me = this;
        const clearFocus = function() {
            me.clearGridFocus(grid);
        };

        view.fileManagementFocusGuardAttached = true;
        me.patchNavigationInstance(view.getNavigationModel ? view.getNavigationModel() : view.navigationModel || null);
        view.on({
            beforerefresh: clearFocus,
            refresh: clearFocus,
            beforedestroy: clearFocus
        });
    },

    attachStore: function(grid, store) {
        if (!store) {
            return;
        }

        const attachedKey = `fileManagementFocusGuardAttached_${grid.id}`;
        if (store[attachedKey]) {
            return;
        }

        const me = this;
        const clearFocus = function() {
            me.clearGridFocus(grid);
        };

        store[attachedKey] = true;
        store.on({
            beforeload: clearFocus,
            load: clearFocus,
            datachanged: clearFocus,
            remove: clearFocus,
            clear: clearFocus
        });
    },

    clearGridFocus: function(grid) {
        if (!grid || grid.destroyed || grid.destroying) {
            return;
        }

        const view = grid.getView ? grid.getView() : null;
        const navigationModel = grid.getNavigationModel
            ? grid.getNavigationModel()
            : view && view.getNavigationModel ? view.getNavigationModel() : null;

        if (navigationModel) {
            this.patchNavigationInstance(navigationModel);
            this.clearNavigationFocus(navigationModel);
        }

        if (view) {
            if (view.actionPosition && view.actionPosition.setAll) {
                this.resetCellContext(view.actionPosition, view);
            }
            view.lastFocused = null;
            view.focusedRow = null;
        }
    },

    clearNavigationFocus: function(navigationModel) {
        if (!navigationModel) {
            return;
        }

        const position = this.ensureNavigationPosition(navigationModel, navigationModel.view);
        this.resetCellContext(position, navigationModel.view);

        if (navigationModel.previousPosition && navigationModel.previousPosition.setAll) {
            this.resetCellContext(navigationModel.previousPosition, navigationModel.previousPosition.view || navigationModel.view);
        } else {
            navigationModel.previousPosition = null;
        }

        navigationModel.lastFocused = null;
        navigationModel.record = null;
        navigationModel.recordIndex = null;
        navigationModel.item = null;
        navigationModel.cell = null;
        navigationModel.column = null;
        navigationModel.columnIndex = null;

        if (navigationModel.view) {
            if (navigationModel.view.actionPosition && navigationModel.view.actionPosition.setAll) {
                this.resetCellContext(navigationModel.view.actionPosition, navigationModel.view);
            } else {
                navigationModel.view.actionPosition = null;
            }
        }
    },

    refreshGridView: function(grid) {
        const view = grid && grid.getView ? grid.getView() : null;

        if (!view || !view.rendered || view.destroyed) {
            return;
        }

        this.clearGridFocus(grid);

        try {
            view.refresh();
        } catch (error) {
            if (!this.isStaleFocusError(error)) {
                throw error;
            }

            this.clearGridFocus(grid);
        }
    }
});
