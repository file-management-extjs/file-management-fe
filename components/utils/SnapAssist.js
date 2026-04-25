Ext.define('FileManagement.components.utils.SnapAssist', {
    extend: 'Ext.container.Container',
    xtype: 'snapassist',
    itemId: 'snapassist',
    id: 'mainSnapContainer',
    cls: 'snap-assist-container',
    x: 0,
    y: 0,
    hidden: false,
    edgeThreshold: 48,
    snapOverlapThreshold: 0.55,
    snapCenterOverlapThreshold: 0.35,
    activeZone: null,
    activeDragState: null,
    dragTrackingState: null,
    parentWorkspace: null,

    statics: {
        activeInstance: null,

        getActive: function() {
            const instance = FileManagement.components.utils.SnapAssist.activeInstance;
            return instance && !instance.destroyed && !instance.destroying ? instance : null;
        }
    },

    layout: 'absolute',

    style: {
        pointerEvents: 'none'
    },

    items: [
        {
            xtype: 'container',
            itemId: 'snapPreview',
            hidden: true,
            cls: 'snap-zone-preview invisible',
            x: 0,
            y: 0,
            width: 0,
            height: 0
        }
    ],

    initComponent: function() {
        this.callParent(arguments);

        this.on('afterrender', function() {
            FileManagement.components.utils.SnapAssist.activeInstance = this;
            this.fitToWorkspace();

            if (this.getEl()) {
                this.getEl().setStyle({
                    position: 'absolute',
                    left: '0px',
                    top: '0px',
                    right: 'auto',
                    bottom: 'auto',
                    pointerEvents: 'none',
                    zIndex: 5
                });
            }
        }, this);

        this.on('destroy', function() {
            if (FileManagement.components.utils.SnapAssist.activeInstance === this) {
                FileManagement.components.utils.SnapAssist.activeInstance = null;
            }
        }, this);
    },

    initialize: function(parentContainer) {
        if (!parentContainer || parentContainer.destroyed || parentContainer.destroying) {
            return;
        }

        this.parentWorkspace = parentContainer;
        FileManagement.components.utils.SnapAssist.activeInstance = this;
        this.fitToWorkspace();
        this.bindExistingPanels(parentContainer);

        if (!this.snapAssistParentListenersBound) {
            this.snapAssistParentListenersBound = true;

            parentContainer.on('add', function(container, component) {
                this.bindDragListeners(component);
                this.fitToWorkspace();
            }, this);

            parentContainer.on('resize', function() {
                this.fitToWorkspace();
                this.clearHighlights();
            }, this);
        }
    },

    bindExistingPanels: function(parentContainer) {
        if (!parentContainer || !parentContainer.items) {
            return;
        }

        parentContainer.items.each(function(panel) {
            this.bindDragListeners(panel);
        }, this);
    },

    bindDragListeners: function(panel) {
        if (!panel || panel.snapAssistDragBound || panel.itemId === this.itemId || !panel.draggable) {
            return;
        }

        if (panel.draggable !== true && !Ext.isObject(panel.draggable)) {
            return;
        }

        if (panel.draggable === true) {
            panel.draggable = {};
        }

        const existingDraggableConfig = Ext.apply({}, panel.draggable);

        if (existingDraggableConfig.onDrag || existingDraggableConfig.onMouseUp) {
            panel.snapAssistDragBound = true;
            return;
        }

        panel.draggable = Ext.apply(existingDraggableConfig, {
            onDrag: function(event, draggedPanel) {
                const targetPanel = draggedPanel || this.panel || panel;
                const snapAssist = FileManagement.components.utils.SnapAssist.getActive();

                if (snapAssist) {
                    snapAssist.onPanelDrag(targetPanel, event, this);
                }
            },
            onMouseUp: function(event, draggedPanel) {
                const targetPanel = draggedPanel || this.panel || panel;
                const snapAssist = FileManagement.components.utils.SnapAssist.getActive();

                if (snapAssist) {
                    snapAssist.onPanelDrop(targetPanel, event, this);
                }
            }
        });

        panel.snapAssistDragBound = true;
    },

    fitToWorkspace: function() {
        const workspace = this.parentWorkspace || this.ownerCt || Ext.getCmp('mainPanelRegion');
        if (!workspace || workspace.destroyed || workspace.destroying) {
            return;
        }

        const size = workspace.getSize ? workspace.getSize() : {
            width: workspace.getWidth(),
            height: workspace.getHeight()
        };

        if (!size || !size.width || !size.height) {
            return;
        }

        this.setPosition(0, 0);
        this.setSize(size.width, size.height);
        this.updateLayout();
    },

    onPanelDrag: function(panel, dragEvent, dragContext) {
        if (!this.isEligiblePanel(panel)) {
            this.clearHighlights();
            return;
        }

        this.fitToWorkspace();
        const dragBox = this.resolveLiveDragBox(panel, dragEvent, dragContext);
        const bestZone = this.findPreviewZone(panel, dragEvent, dragContext, dragBox);

        this.activeDragState = bestZone && dragBox
            ? {
                panelId: this.getPanelIdentity(panel),
                zoneItemId: bestZone.itemId,
                dragBox: Ext.apply({}, dragBox),
                capturedAt: Ext.Date.now()
            }
            : null;

        this.highlightZone(bestZone);
    },

    onPanelDrop: function(panel, dragEvent, dragContext) {
        if (!this.isEligiblePanel(panel)) {
            this.clearHighlights();
            return false;
        }

        this.fitToWorkspace();
        const bestZone = this.findDropZone(panel, dragEvent, dragContext);
        if (!bestZone) {
            panel.snappedToZone = null;
            this.clearHighlights();
            return false;
        }

        this.snapToZone(panel, bestZone);
        this.clearHighlights();
        return true;
    },

    isEligiblePanel: function(panel) {
        const workspace = this.parentWorkspace || Ext.getCmp('mainPanelRegion');
        const panelUtils = FileManagement.components.utils.PanelUtils;

        if (!panel || !workspace || panel === this || panel.itemId === 'snapassist') {
            return false;
        }

        if (panel.xtype === 'homedashboard' || panel.itemId === 'homeDashboard' || panel.minimizedToTaskbar) {
            return false;
        }

        if (panel.ownerCt !== workspace || !panel.rendered || !panel.getEl || !panel.getEl()) {
            return false;
        }

        if (panelUtils && panelUtils.isMobileWorkspace && panelUtils.isMobileWorkspace()) {
            return false;
        }

        return !panel.destroyed && !panel.destroying && (!panel.isVisible || panel.isVisible());
    },

    findPreviewZone: function(panel, dragEvent, dragContext, resolvedDragBox) {
        const workspace = this.parentWorkspace || this.ownerCt || Ext.getCmp('mainPanelRegion');
        if (!workspace || workspace.destroyed || workspace.destroying || !workspace.rendered || !workspace.getEl()) {
            return null;
        }

        const workspaceBox = this.normalizeBox(workspace.getEl().getBox());
        const dragBox = resolvedDragBox || this.resolveDragBox(panel, dragContext);
        const anchorPoint = this.resolveAnchorPoint(dragBox, dragEvent);
        const zoneItemId = this.getZoneItemIdFromPoint(anchorPoint, workspaceBox);

        if (!zoneItemId) {
            return null;
        }

        return this.buildZoneDescriptor(workspace, workspaceBox, zoneItemId);
    },

    findDropZone: function(panel, dragEvent, dragContext) {
        const workspace = this.parentWorkspace || this.ownerCt || Ext.getCmp('mainPanelRegion');
        if (!workspace || workspace.destroyed || workspace.destroying || !workspace.rendered || !workspace.getEl()) {
            return null;
        }

        const workspaceBox = this.normalizeBox(workspace.getEl().getBox());
        const dragBox = this.getActiveDragBox(panel) || this.resolveDragBox(panel, dragContext);
        if (!dragBox) {
            return null;
        }

        const zoneIds = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
        let bestZone = null;

        zoneIds.forEach(function(zoneItemId) {
            const descriptor = this.buildZoneDescriptor(workspace, workspaceBox, zoneItemId);
            if (!descriptor || !descriptor.pageBox) {
                return;
            }

            const zoneMetrics = this.getZoneOverlapMetrics(dragBox, descriptor);

            if (!bestZone || zoneMetrics.overlapArea > bestZone.overlapArea) {
                bestZone = zoneMetrics;
            }
        }, this);

        if (!bestZone || bestZone.overlapArea <= 0) {
            return null;
        }

        const activeZoneItemId = this.getActiveZoneItemId(panel);
        if (activeZoneItemId) {
            const activeDescriptor = this.buildZoneDescriptor(workspace, workspaceBox, activeZoneItemId);
            const activeZone = activeDescriptor
                ? this.getZoneOverlapMetrics(dragBox, activeDescriptor)
                : null;

            if (activeZone && activeZone.overlapArea > 0 && this.shouldSnapToZone(activeZone)) {
                return activeZone;
            }

            return null;
        }

        if (this.shouldSnapToZone(bestZone)) {
            return bestZone;
        }

        return null;
    },

    getZoneOverlapMetrics: function(dragBox, descriptor) {
        const panelArea = Math.max(dragBox.width * dragBox.height, 1);
        const zoneArea = Math.max(descriptor.pageBox.width * descriptor.pageBox.height, 1);
        const overlapArea = this.getOverlapArea(dragBox, descriptor.pageBox);
        const panelOverlapRatio = overlapArea / panelArea;
        const zoneOverlapRatio = overlapArea / zoneArea;
        const overlapRatio = overlapArea / Math.max(Math.min(panelArea, zoneArea), 1);
        const centerInside = this.isPointInsideBox(dragBox.centerX, dragBox.centerY, descriptor.pageBox);

        return Ext.apply(descriptor, {
            overlapArea,
            overlapRatio,
            panelOverlapRatio,
            zoneOverlapRatio,
            centerInside
        });
    },

    shouldSnapToZone: function(zone) {
        if (!zone || zone.overlapArea <= 0) {
            return false;
        }

        if (zone.overlapRatio >= this.snapOverlapThreshold) {
            return true;
        }

        return zone.centerInside && zone.panelOverlapRatio >= this.snapCenterOverlapThreshold;
    },

    getActiveDragBox: function(panel) {
        const state = this.activeDragState;
        if (!state || !state.dragBox) {
            return null;
        }

        if (state.panelId !== this.getPanelIdentity(panel)) {
            return null;
        }

        if (Ext.Date.now() - state.capturedAt > 1200) {
            return null;
        }

        return Ext.apply({}, state.dragBox);
    },

    getActiveZoneItemId: function(panel) {
        if (this.activeZone) {
            return this.activeZone;
        }

        const state = this.activeDragState;
        if (!state || state.panelId !== this.getPanelIdentity(panel)) {
            return null;
        }

        if (Ext.Date.now() - state.capturedAt > 1200) {
            return null;
        }

        return state.zoneItemId || null;
    },

    getPanelIdentity: function(panel) {
        if (!panel) {
            return '';
        }

        return panel.getId ? panel.getId() : (panel.id || panel.itemId || '');
    },

    getPreviewZone: function() {
        return this.down('#snapPreview');
    },

    highlightZone: function(activeZone) {
        this.activeZone = activeZone ? activeZone.itemId : null;
        const previewZone = this.getPreviewZone();

        if (this.rendered && this.getEl()) {
            this.getEl().setStyle('z-index', activeZone ? (window.highestZIndex || 1) + 2 : 5);
        }

        if (!previewZone || previewZone.destroyed || previewZone.destroying) {
            return;
        }

        if (!activeZone || !activeZone.layoutBox) {
            previewZone.hide();
            previewZone.removeCls('highlight-region');
            previewZone.addCls('invisible');

            if (previewZone.getEl()) {
                previewZone.getEl().setStyle('visibility', 'hidden');
            }

            return;
        }

        previewZone.removeCls('invisible');
        previewZone.addCls('highlight-region');
        previewZone.setPosition(activeZone.layoutBox.left, activeZone.layoutBox.top);
        previewZone.setSize(activeZone.layoutBox.width, activeZone.layoutBox.height);
        previewZone.show();

        if (previewZone.getEl()) {
            previewZone.getEl().setStyle('visibility', 'visible');
        }
    },

    snapToZone: function(panel, zone) {
        const workspace = this.parentWorkspace || Ext.getCmp('mainPanelRegion');

        if (!panel || !zone || !workspace || !zone.layoutBox) {
            return;
        }

        const localLeft = zone.layoutBox.left;
        const localTop = zone.layoutBox.top;
        const width = zone.layoutBox.width;
        const height = zone.layoutBox.height;

        panel.setPosition(localLeft, localTop);
        panel.setSize(width, height);
        panel.snappedToZone = zone.itemId;

        if (panel.getEl()) {
            panel.getEl().setStyle('z-index', ++window.highestZIndex);
        }

        if (FileManagement.components.utils.PanelUtils &&
            FileManagement.components.utils.PanelUtils.afterWorkspacePanelFit) {
            FileManagement.components.utils.PanelUtils.afterWorkspacePanelFit(panel);
        }
    },

    clearHighlights: function() {
        this.activeZone = null;
        this.activeDragState = null;
        this.dragTrackingState = null;
        const previewZone = this.getPreviewZone();

        if (this.rendered && this.getEl()) {
            this.getEl().setStyle('z-index', 5);
        }

        if (!previewZone || previewZone.destroyed || previewZone.destroying) {
            return;
        }

        previewZone.removeCls('highlight-region');
        previewZone.addCls('invisible');
        previewZone.hide();

        if (previewZone.getEl()) {
            previewZone.getEl().setStyle('visibility', 'hidden');
        }
    },

    buildZoneDescriptor: function(workspace, workspaceBox, zoneItemId) {
        const layoutBox = this.getZoneLayoutBox(workspace, zoneItemId);
        if (!layoutBox) {
            return null;
        }

        return {
            itemId: zoneItemId,
            layoutBox,
            pageBox: this.toPageBox(layoutBox, workspaceBox)
        };
    },

    normalizeBox: function(box) {
        const left = Number(box.left ?? box.x ?? 0);
        const top = Number(box.top ?? box.y ?? 0);
        const width = Number(box.width ?? Math.max((box.right || 0) - left, 0));
        const height = Number(box.height ?? Math.max((box.bottom || 0) - top, 0));

        return {
            left,
            top,
            width,
            height,
            right: Number(box.right ?? left + width),
            bottom: Number(box.bottom ?? top + height),
            centerX: left + (width / 2),
            centerY: top + (height / 2)
        };
    },

    toPageBox: function(layoutBox, workspaceBox) {
        if (!layoutBox || !workspaceBox) {
            return null;
        }

        return this.normalizeBox({
            left: workspaceBox.left + layoutBox.left,
            top: workspaceBox.top + layoutBox.top,
            width: layoutBox.width,
            height: layoutBox.height
        });
    },

    getOverlapArea: function(firstBox, secondBox) {
        if (!firstBox || !secondBox) {
            return 0;
        }

        const horizontal = Math.max(0, Math.min(firstBox.right, secondBox.right) - Math.max(firstBox.left, secondBox.left));
        const vertical = Math.max(0, Math.min(firstBox.bottom, secondBox.bottom) - Math.max(firstBox.top, secondBox.top));
        return horizontal * vertical;
    },

    isPointInsideBox: function(x, y, box) {
        if (!box) {
            return false;
        }

        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    },

    getZoneItemIdFromPoint: function(point, workspaceBox) {
        if (!point || !workspaceBox) {
            return null;
        }

        if (point.x < workspaceBox.left || point.x > workspaceBox.right ||
            point.y < workspaceBox.top || point.y > workspaceBox.bottom) {
            return null;
        }

        const midX = workspaceBox.left + (workspaceBox.width / 2);
        const midY = workspaceBox.top + (workspaceBox.height / 2);
        const horizontal = point.x < midX ? 'Left' : 'Right';
        const vertical = point.y < midY ? 'top' : 'bottom';

        if (vertical === 'top' && horizontal === 'Left') {
            return 'topLeft';
        }

        if (vertical === 'top' && horizontal === 'Right') {
            return 'topRight';
        }

        if (vertical === 'bottom' && horizontal === 'Left') {
            return 'bottomLeft';
        }

        if (vertical === 'bottom' && horizontal === 'Right') {
            return 'bottomRight';
        }

        return null;
    },

    resolvePointer: function(dragEvent) {
        if (!dragEvent) {
            return null;
        }

        if (dragEvent.getXY) {
            const xy = dragEvent.getXY();
            if (xy && xy.length >= 2) {
                return {
                    x: Number(xy[0]),
                    y: Number(xy[1])
                };
            }
        }

        const browserEvent = dragEvent.browserEvent || dragEvent.event || dragEvent;
        if (!browserEvent) {
            return null;
        }

        if (browserEvent.pageX != null && browserEvent.pageY != null) {
            return {
                x: Number(browserEvent.pageX),
                y: Number(browserEvent.pageY)
            };
        }

        if (browserEvent.clientX != null && browserEvent.clientY != null) {
            return {
                x: Number(browserEvent.clientX),
                y: Number(browserEvent.clientY)
            };
        }

        return null;
    },

    resolveAnchorPoint: function(dragBox, dragEvent) {
        const pointer = this.resolvePointer(dragEvent);
        if (pointer) {
            return pointer;
        }

        if (dragBox) {
            return {
                x: dragBox.centerX,
                y: dragBox.centerY
            };
        }

        return null;
    },

    resolveDragBox: function(panel, dragContext) {
        const proxyEl = dragContext && dragContext.proxy && dragContext.proxy.getEl
            ? dragContext.proxy.getEl()
            : null;

        if (proxyEl && proxyEl.getBox) {
            const proxyBox = this.normalizeBox(proxyEl.getBox());
            if (this.isUsableBox(proxyBox)) {
                return proxyBox;
            }
        }

        const panelEl = panel && panel.getEl ? panel.getEl() : null;
        if (panelEl && panelEl.getBox) {
            const panelBox = this.normalizeBox(panelEl.getBox());
            if (this.isUsableBox(panelBox)) {
                return panelBox;
            }
        }

        return null;
    },

    resolveLiveDragBox: function(panel, dragEvent, dragContext) {
        const rawBox = this.resolveDragBox(panel, dragContext);
        const pointer = this.resolvePointer(dragEvent);
        const panelId = this.getPanelIdentity(panel);

        if (!pointer || !rawBox) {
            return rawBox;
        }

        if (!this.dragTrackingState || this.dragTrackingState.panelId !== panelId) {
            this.dragTrackingState = {
                panelId,
                lastPointer: Ext.apply({}, pointer),
                lastRawBox: Ext.apply({}, rawBox)
            };
            return rawBox;
        }

        const lastPointer = this.dragTrackingState.lastPointer;
        const lastRawBox = this.dragTrackingState.lastRawBox;
        const rawMoved =
            Math.abs(rawBox.left - lastRawBox.left) >= 2 ||
            Math.abs(rawBox.top - lastRawBox.top) >= 2;

        if (rawMoved) {
            this.dragTrackingState.lastPointer = Ext.apply({}, pointer);
            this.dragTrackingState.lastRawBox = Ext.apply({}, rawBox);
            return rawBox;
        }

        const deltaX = pointer.x - lastPointer.x;
        const deltaY = pointer.y - lastPointer.y;

        if (Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) {
            return rawBox;
        }

        const syntheticBox = this.normalizeBox({
            left: lastRawBox.left + deltaX,
            top: lastRawBox.top + deltaY,
            width: lastRawBox.width,
            height: lastRawBox.height
        });

        return this.isUsableBox(syntheticBox)
            ? syntheticBox
            : rawBox;
    },

    isUsableBox: function(box) {
        return box &&
            Number.isFinite(box.left) &&
            Number.isFinite(box.top) &&
            Number.isFinite(box.width) &&
            Number.isFinite(box.height) &&
            box.width > 0 &&
            box.height > 0;
    },

    getZoneLayoutBox: function(workspace, zoneItemId) {
        if (!workspace || !zoneItemId) {
            return null;
        }

        const size = workspace.getSize ? workspace.getSize() : {
            width: workspace.getWidth(),
            height: workspace.getHeight()
        };

        if (!size || !size.width || !size.height) {
            return null;
        }

        const leftWidth = Math.floor(size.width / 2);
        const rightWidth = size.width - leftWidth;
        const topHeight = Math.floor(size.height / 2);
        const bottomHeight = size.height - topHeight;

        const boxes = {
            topLeft: {
                left: 0,
                top: 0,
                width: leftWidth,
                height: topHeight
            },
            topRight: {
                left: leftWidth,
                top: 0,
                width: rightWidth,
                height: topHeight
            },
            bottomLeft: {
                left: 0,
                top: topHeight,
                width: leftWidth,
                height: bottomHeight
            },
            bottomRight: {
                left: leftWidth,
                top: topHeight,
                width: rightWidth,
                height: bottomHeight
            }
        };

        return boxes[zoneItemId] || null;
    }
});
