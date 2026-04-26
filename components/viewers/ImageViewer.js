Ext.define('FileManagement.components.viewers.ImageViewer', {
    extend: 'Ext.panel.Panel',
    xtype: 'imageviewer',

    config: {
        src: null,
        isShared: false,
        permission: null
    },

    title: 'Image Viewer',
    layout: 'fit',
    closable: true,
    frame: true,
    modal: true,

    width: 400, // Set a fixed width
    height: 350, // Set a fixed height
    x: 0,
    y: 0,

    style: {
        zIndex: ++window.highestZIndex,
    },

    draggable: {
        onMouseUp: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true, // Enable constraint within a specified element
        dynamic: true, // Updates size dynamically as resizing
        minHeight: 300,
        minWidth: 450,
    },

    header: {
        listeners: {
            dblclick: function (header) {
                const panel = header.up('panel');
                FileManagement.components.utils.PanelUtils.toggleMaximize(panel);
            }
        }
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function () {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            handler: function () {
                const panel = this.up('panel');
                if (panel && !panel.maximized) {
                    FileManagement.components.utils.PanelUtils.maximizePanel(panel);
                } else if (panel) {
                    FileManagement.components.utils.PanelUtils.minimizePanel(panel);
                }
            }
        }
    ],

    tbar: [
        {
            text: 'Convert',
            itemId: 'convertMenuButton',
            iconCls: 'fa fa-exchange-alt',
            menu: {
                xtype: 'menu',
                items: [
                    {
                        xtype: 'combobox',
                        fieldLabel: 'Target Format',
                        itemId: 'targetFormat',
                        store: ['PNG', 'JPG', 'WEBP', 'AVIF'],
                        editable: false,
                        width: 150
                    },
                    {
                        xtype: 'sliderfield',
                        fieldLabel: 'Quality (%)',
                        itemId: 'qualitySlider',
                        minValue: 1,
                        maxValue: 100,
                        value: 100,
                        increment: 1,
                        width: 300
                    },
                    {
                        text: 'Convert',
                        iconCls: 'fa fa-check',
                        handler: function () {
                            const token = FileManagement.helpers.Functions.getToken();
                            const viewer = this.up('imageviewer');
                            const targetFormat = viewer.down('#targetFormat')?.getValue();
                            const quality = viewer.down('#qualitySlider')?.getValue();
                            const grid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();

                            if (viewer.getIsShared && viewer.getIsShared()) {
                                Ext.Msg.alert('Conversion Disabled', 'Shared images can be viewed, but only the owner can convert them.');
                                return;
                            }

                            if (!targetFormat) {
                                Ext.Msg.alert('Error', 'Please select a target format.');
                                return;
                            }

                            viewer.mask(`Converting to "${targetFormat}"...`);

                            Ext.Ajax.request({
                                url: FileManagementEnv.apiUrl('/api/image/convert-image'),
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                },
                                jsonData: {
                                    fileId: viewer.fileId,
                                    targetFormat: targetFormat,
                                    quality: quality
                                },
	                                success: function (response) {
	                                    const payload = Ext.decode(response.responseText, true) || {};
	                                    const queuedForScan = payload.scanStatus === 'pending';
	                                    Ext.Msg.alert(
	                                        'Success',
	                                        queuedForScan
	                                            ? 'Image converted successfully. It will appear in File Explorer after virus scanning completes.'
	                                            : 'Image converted successfully.'
	                                    );
	                                },
                                failure: function (response) {
                                    const payload = Ext.decode(response.responseText, true) || {};
                                    Ext.Msg.alert('Error', payload.error || 'Failed to convert the image.');
                                },
                                callback: function () {
                                    if (grid && grid.getStore) {
                                        grid.getStore().reload();
                                    }
                                    viewer.unmask();
                                }
                            });
                        }
                    }
                ]
            }
        }
    ],

    listeners: {
        afterrender: function (panel) {
            // Ensure absolute positioning for free dragging
            const el = panel.getEl();
            if (el) {
                el.setStyle('z-index', ++window.highestZIndex); // Set a base z-index
            }

            const mainPanelRegion = Ext.getCmp('mainPanelRegion');
            const mainPanelRegionBox = mainPanelRegion.getBox();

            panel.maxWidth = mainPanelRegionBox.width;
            panel.maxHeight = mainPanelRegionBox.height;
        }
    },

    initComponent: function() {
        const token = FileManagement.helpers.Functions.getToken();
        const imagePath = this.getSrc();
        const viewerPanel = this;

        if (this.getIsShared && this.getIsShared()) {
            this.tbar = null;
        }

        this.items = [{
            xtype: 'image',
            listeners: {
                afterrender: async function(img) {
                    try {
                        const response = await fetch(imagePath, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (!response.ok) throw new Error('Failed to load image');

                        const blob = await response.blob();
                        const objectURL = URL.createObjectURL(blob);
                        img.setSrc(objectURL);

                        const image = new Image();
                        image.src = objectURL;
                        image.onload = () => {
                            const { width: naturalWidth, height: naturalHeight } = image;
                            const viewerFactory = FileManagement.components.viewers.ViewerFactory;

                            if (viewerFactory && viewerFactory.applyDefaultViewerSize) {
                                viewerFactory.applyDefaultViewerSize(viewerPanel, {
                                    preferredWidth: naturalWidth,
                                    preferredHeight: naturalHeight,
                                    force: true
                                });
                            }

                            // Set minimum dimensions for usability
                            viewerPanel.setMinWidth(Math.min(viewerPanel.minWidth || 300, viewerPanel.getWidth ? viewerPanel.getWidth() : 300));
                            viewerPanel.setMinHeight(Math.min(viewerPanel.minHeight || 200, viewerPanel.getHeight ? viewerPanel.getHeight() : 200));
                        };
                    } catch (error) {
                        Ext.Msg.alert('Error', 'Failed to load the image.');
                    }
                }
            }
        }];

        this.callParent();
    }
});
