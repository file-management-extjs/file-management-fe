Ext.define('FileManagement.components.viewers.HtmlViewer', {
    extend: 'Ext.panel.Panel',
    xtype: 'htmlviewer',

    config: {
        src: null,
        fileName: null
    },

    title: 'HTML Viewer',
    layout: 'fit',
    closable: true,
    frame: true,
    modal: true,

    cls: 'iframe-container',

    width: 700,
    height: 500,
    x: 220,
    y: 220,

    draggable: {
        onMouseUp: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true,
        dynamic: true,
        minHeight: 320,
        minWidth: 460
    },

    header: {
        listeners: {
            dblclick: function(header) {
                const panel = header.up('panel');
                FileManagement.components.utils.PanelUtils.toggleMaximize(panel);
            }
        }
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function() {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            handler: function() {
                const panel = this.up('panel');
                if (panel && !panel.maximized) {
                    FileManagement.components.utils.PanelUtils.maximizePanel(panel);
                } else if (panel) {
                    FileManagement.components.utils.PanelUtils.minimizePanel(panel);
                }
            }
        }
    ],

    listeners: {
        afterrender: function(panel) {
            const el = panel.getEl();
            if (el) {
                el.setStyle('z-index', ++window.highestZIndex);
            }
        }
    },

    initComponent: function() {
        this.items = [
            {
                xtype: 'container',
                html: 'Loading HTML preview...',
                style: 'width: 100%; height: 100%; text-align: center; padding-top: 20px;'
            }
        ];

        this.callParent(arguments);
        this.loadHtmlContent();
    },

    loadHtmlContent: async function() {
        const me = this;
        const token = FileManagement.helpers.Functions.getToken();
        const fileUrl = this.getSrc();

        try {
            const response = await fetch(fileUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load HTML preview');
            }

            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);

            this.removeAll();
            this.add({
                xtype: 'component',
                itemId: 'htmlFrame',
                autoEl: {
                    tag: 'iframe',
                    src: objectURL,
                    tabindex: 0,
                    sandbox: 'allow-same-origin',
                    style: 'width: 100%; height: 100%; border: none; background: #fff;'
                }
            });

            this.on('beforeclose', function() {
                URL.revokeObjectURL(objectURL);
            }, this, { single: true });

            Ext.defer(function() {
                const frameComponent = me.down('#htmlFrame');
                const frameEl = frameComponent && frameComponent.getEl ? frameComponent.getEl() : null;
                const frameDom = frameEl && frameEl.dom ? frameEl.dom : null;

                if (frameDom) {
                    try {
                        frameDom.focus();
                    } catch (error) {
                        // Browser may decline focus on the iframe.
                    }
                }
            }, 120);
        } catch (error) {
            Ext.Msg.alert('Error', `Failed to load the HTML preview: ${error.message}`);
            this.close();
        }
    }
});
