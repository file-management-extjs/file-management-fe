Ext.define('FileManagement.components.utils.ResponsiveGrid', {
    singleton: true,

    compactBreakpoint: 520,
    initialized: false,

    init: function() {
        if (this.initialized || !Ext.grid || !Ext.grid.Panel) {
            return;
        }

        this.initialized = true;

        if (!Ext.grid.Panel.fileManagementResponsiveGridPatchApplied) {
            Ext.grid.Panel.fileManagementResponsiveGridPatchApplied = true;

            Ext.override(Ext.grid.Panel, {
                initComponent: function() {
                    this.callParent(arguments);

                    if (this.disableResponsiveListing) {
                        return;
                    }

                    this.on({
                        afterrender: function(grid) {
                            FileManagement.components.utils.ResponsiveGrid.prepareGrid(grid);
                        },
                        resize: function(grid) {
                            FileManagement.components.utils.ResponsiveGrid.applyGrid(grid);
                        },
                        columnhide: function(headerCt, column) {
                            FileManagement.components.utils.ResponsiveGrid.onColumnVisibilityChange(this, column || headerCt, true);
                        },
                        columnshow: function(headerCt, column) {
                            FileManagement.components.utils.ResponsiveGrid.onColumnVisibilityChange(this, column || headerCt, false);
                        },
                        columnresize: function() {
                            FileManagement.components.utils.ResponsiveGrid.deferApply(this);
                        }
                    });
                }
            });
        }

        this.prepareContainer();
    },

    prepareContainer: function(container) {
        Ext.Array.forEach(this.getGrids(container), grid => this.prepareGrid(grid));
    },

    applyContainer: function(container) {
        Ext.Array.forEach(this.getGrids(container), grid => this.applyGrid(grid));
    },

    getGrids: function(container) {
        if (!Ext.ComponentQuery) {
            return [];
        }

        if (!container || !container.isComponent) {
            return this.uniqueGrids(
                Ext.ComponentQuery.query('grid').concat(Ext.ComponentQuery.query('gridpanel'))
            );
        }

        if (container.isXType && (container.isXType('grid') || container.isXType('gridpanel'))) {
            return [container];
        }

        return container.query
            ? this.uniqueGrids(container.query('grid').concat(container.query('gridpanel')))
            : [];
    },

    uniqueGrids: function(grids) {
        const seen = {};

        return Ext.Array.filter(grids || [], grid => {
            if (!grid || seen[grid.id]) {
                return false;
            }

            seen[grid.id] = true;
            return true;
        });
    },

    prepareGrid: function(grid) {
        if (!grid || grid.destroyed || grid.destroying || grid.disableResponsiveListing) {
            return;
        }

        if (!this.isGridMeasurable(grid)) {
            this.prepareAfterRender(grid);
            return;
        }

        const columns = this.getColumns(grid);
        if (!columns.length) {
            return;
        }

        if (!grid.responsiveListingPrepared) {
            grid.responsiveListingPrepared = true;
            grid.responsiveOriginalHideHeaders = grid.hideHeaders;

            grid.on('reconfigure', function(currentGrid) {
                currentGrid.responsiveListingPrepared = false;
                currentGrid.responsivePrimaryColumn = null;
                FileManagement.components.utils.ResponsiveGrid.prepareGrid(currentGrid);
            });
        }

        Ext.Array.forEach(columns, column => this.captureColumn(grid, column));

        const primaryColumn = this.findPrimaryColumn(grid, columns);
        if (primaryColumn && !primaryColumn.responsivePrimaryRendererApplied) {
            primaryColumn.responsivePrimaryRendererApplied = true;
            primaryColumn.renderer = this.createPrimaryRenderer(grid, primaryColumn);
        }

        this.applyGrid(grid);
    },

    captureColumn: function(grid, column) {
        if (!column || column.responsiveListingCaptured) {
            return;
        }

        column.responsiveListingCaptured = true;
        column.responsiveOriginalHidden = !!column.hidden;
        column.responsiveOriginalRenderer = column.renderer || null;
        column.responsiveOwningGrid = grid;
    },

    applyGrid: function(grid) {
        if (!grid || grid.destroyed || grid.destroying || grid.disableResponsiveListing) {
            return;
        }

        if (!this.isGridMeasurable(grid)) {
            this.prepareAfterRender(grid);
            return;
        }

        if (!grid.responsiveListingPrepared) {
            this.prepareGrid(grid);
            return;
        }

        const columns = this.getColumns(grid);
        const primaryColumn = this.findPrimaryColumn(grid, columns);
        const compact = this.isCompact(grid);

        if (grid.setHideHeaders && grid.responsiveOriginalHideHeaders !== undefined) {
            grid.setHideHeaders(compact ? true : grid.responsiveOriginalHideHeaders);
        }

        if (grid.el) {
            grid.el[compact ? 'addCls' : 'removeCls']('responsive-list-grid');
        }

        Ext.Array.forEach(columns, column => {
            if (!column || column.destroyed || column === primaryColumn || this.isUtilityColumn(column)) {
                return;
            }

            if (compact && this.isDetailColumn(column)) {
                this.setColumnHidden(column, true);
                return;
            }

            this.setColumnHidden(column, !!column.responsiveOriginalHidden);
        });

        if (primaryColumn) {
            this.setColumnHidden(primaryColumn, !!primaryColumn.responsiveOriginalHidden);
        }

        this.refreshGrid(grid);
    },

    deferApply: function(grid) {
        if (!grid || grid.responsiveApplyingColumns) {
            return;
        }

        Ext.defer(() => this.applyGrid(grid), 1);
    },

    prepareAfterRender: function(grid) {
        if (!grid || grid.destroyed || grid.destroying || grid.responsivePrepareAfterRenderAttached) {
            return;
        }

        grid.responsivePrepareAfterRenderAttached = true;
        grid.on('afterrender', function(currentGrid) {
            currentGrid.responsivePrepareAfterRenderAttached = false;
            FileManagement.components.utils.ResponsiveGrid.prepareGrid(currentGrid);
        }, null, { single: true });
    },

    isGridMeasurable: function(grid) {
        if (!grid || grid.destroyed || grid.destroying || !grid.rendered) {
            return false;
        }

        const element = grid.getEl ? grid.getEl() : grid.el;
        return !!(element && element.dom);
    },

    onColumnVisibilityChange: function(grid, column, hidden) {
        if (!grid || grid.responsiveApplyingColumns) {
            return;
        }

        if (!column || column.isGroupHeader || this.isUtilityColumn(column)) {
            this.deferApply(grid);
            return;
        }

        this.captureColumn(grid, column);
        column.responsiveOriginalHidden = !!hidden;

        if (grid.responsivePrimaryColumn === column) {
            grid.responsivePrimaryColumn = null;
        }

        this.deferApply(grid);
    },

    setColumnHidden: function(column, hidden) {
        if (!column || column.hidden === hidden) {
            return;
        }

        const grid = column.responsiveOwningGrid;
        if (grid) {
            grid.responsiveApplyingColumns = true;
        }

        try {
            column.setHidden(hidden);
        } finally {
            if (grid) {
                grid.responsiveApplyingColumns = false;
            }
        }
    },

    refreshGrid: function(grid) {
        const focusGuard = FileManagement.components.utils.GridFocusGuard;
        if (focusGuard && focusGuard.refreshGridView) {
            focusGuard.refreshGridView(grid);
            return;
        }

        const view = grid && grid.getView ? grid.getView() : null;
        if (view && view.rendered && !view.destroyed) {
            try {
                view.refresh();
            } catch (error) {
                if (!focusGuard || !focusGuard.isStaleFocusError || !focusGuard.isStaleFocusError(error)) {
                    throw error;
                }
            }
        }
    },

    isCompact: function(grid) {
        const width = this.getGridWidth(grid);
        const panelUtils = FileManagement.components.utils.PanelUtils;
        const workspaceMobile = panelUtils && panelUtils.isMobileWorkspace
            ? panelUtils.isMobileWorkspace()
            : Ext.Element.getViewportWidth() < 720;

        return workspaceMobile || width > 0 && width < this.compactBreakpoint;
    },

    getGridWidth: function(grid) {
        if (!this.isGridMeasurable(grid)) {
            return 0;
        }

        try {
            if (grid.getWidth) {
                return Number(grid.getWidth()) || 0;
            }

            const element = grid.getEl ? grid.getEl() : grid.el;
            return element && element.getWidth ? Number(element.getWidth()) || 0 : 0;
        } catch (error) {
            return 0;
        }
    },

    getColumns: function(grid) {
        const columnManager = grid.getColumnManager ? grid.getColumnManager() : null;
        const columns = columnManager && columnManager.getColumns ? columnManager.getColumns() : grid.columns || [];

        return Ext.Array.filter(columns, column => column && !column.isGroupHeader);
    },

    findPrimaryColumn: function(grid, columns) {
        if (grid.responsivePrimaryColumn && !grid.responsivePrimaryColumn.destroyed) {
            return grid.responsivePrimaryColumn;
        }

        const primary = Ext.Array.findBy(columns, column => column.responsivePrimary) ||
            Ext.Array.findBy(columns, column => this.isPrimaryCandidate(column));

        grid.responsivePrimaryColumn = primary || null;
        return grid.responsivePrimaryColumn;
    },

    isPrimaryCandidate: function(column) {
        return !!column &&
            !!column.dataIndex &&
            !this.isUtilityColumn(column) &&
            !column.responsiveOriginalHidden &&
            column.xtype !== 'widgetcolumn';
    },

    isUtilityColumn: function(column) {
        if (!column) {
            return true;
        }

        const text = Ext.String.trim(String(column.text || ''));
        const width = Number(column.width) || 0;

        return !!column.isCheckerHd ||
            column.xtype === 'checkcolumn' ||
            column.xtype === 'actioncolumn' ||
            column.dataIndex === undefined ||
            column.dataIndex === null ||
            (!text && width > 0 && width <= 44);
    },

    isDetailColumn: function(column) {
        return !!column &&
            !!column.dataIndex &&
            !column.responsiveAlwaysColumn &&
            !this.isUtilityColumn(column);
    },

    createPrimaryRenderer: function(grid, primaryColumn) {
        return function(value, metaData, record, rowIndex, colIndex, store, view) {
            return FileManagement.components.utils.ResponsiveGrid.renderPrimaryCell(
                grid,
                primaryColumn,
                value,
                metaData,
                record,
                rowIndex,
                colIndex,
                store,
                view
            );
        };
    },

    renderPrimaryCell: function(grid, primaryColumn, value, metaData, record, rowIndex, colIndex, store, view) {
        const primaryHtml = this.renderColumn(primaryColumn, value, metaData, record, rowIndex, colIndex, store, view, true);

        if (!this.isCompact(grid)) {
            return primaryHtml;
        }

        const details = this.getDetailItems(grid, primaryColumn, record, rowIndex, store, view);
        if (!details.length) {
            return `<div class="responsive-list-primary">${primaryHtml}</div>`;
        }

        return [
            `<div class="responsive-list-primary">${primaryHtml}</div>`,
            '<div class="responsive-list-meta">',
                details.join(''),
            '</div>'
        ].join('');
    },

    getDetailItems: function(grid, primaryColumn, record, rowIndex, store, view) {
        return Ext.Array.map(this.getColumns(grid), (column, columnIndex) => {
            if (!column || column === primaryColumn || !this.isDetailColumn(column)) {
                return null;
            }

            if (column.responsiveOriginalHidden) {
                return null;
            }

            const value = record && record.get ? record.get(column.dataIndex) : null;
            if (value === null || value === undefined || value === '') {
                return null;
            }

            const renderedValue = this.renderColumn(column, value, {}, record, rowIndex, columnIndex, store, view, false);
            if (renderedValue === null || renderedValue === undefined || renderedValue === '') {
                return null;
            }

            return [
                '<span class="responsive-list-meta-item">',
                    '<span class="responsive-list-meta-label">',
                        Ext.String.htmlEncode(column.text || column.dataIndex),
                    ':</span> ',
                    '<span class="responsive-list-meta-value">',
                        renderedValue,
                    '</span>',
                '</span>'
            ].join('');
        }).filter(Boolean);
    },

    renderColumn: function(column, value, metaData, record, rowIndex, columnIndex, store, view, primary) {
        const renderer = column.responsiveOriginalRenderer;

        if (renderer) {
            return renderer.call(column.scope || column.responsiveOwningGrid || column, value, metaData, record, rowIndex, columnIndex, store, view);
        }

        if (column.xtype === 'widgetcolumn' && column.widget && column.widget.xtype === 'progressbarwidget') {
            return `${Math.round((Number(value) || 0) * 100)}%`;
        }

        if (Ext.isDate(value)) {
            return Ext.Date.format(value, 'Y-m-d H:i');
        }

        if (primary) {
            return Ext.String.htmlEncode(String(value));
        }

        return Ext.String.htmlEncode(String(value));
    }
});
