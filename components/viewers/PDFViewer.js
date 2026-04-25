// PDFViewer.js
Ext.define('FileManagement.components.viewers.PDFViewer', {
    extend: 'Ext.panel.Panel',
    xtype: 'pdfviewer',

    config: {
        src: null,
        fileName: null
    },

    title: 'PDF Viewer',
    layout: 'fit',
    closable: true,
    frame: true,
    modal: true,

    cls: "iframe-container",

    width: 600, // Set a fixed width
    height: 400, // Set a fixed height
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

    listeners: {
        afterrender: function (panel) {
            // Ensure absolute positioning for free dragging
            const el = panel.getEl();
            if (el) {
                el.setStyle('z-index', ++window.highestZIndex); // Set a base z-index
            }
        }
    },

    initComponent: function () {
        // Initialize the PDF viewer with a placeholder component
        this.items = [{
            xtype: 'container',
            html: 'Loading PDF...',
            style: 'width: 100%; height: 100%; text-align: center; padding-top: 20px;'
        }];

        this.callParent(arguments);

        // Load the PDF content after initialization
        this.loadPdfContent();
    },

    loadPdfContent: async function () {
        const me = this;
        const token = FileManagement.helpers.Functions.getToken();
        const fileUrl = this.getSrc();

        try {
            // Fetch the PDF file with the Authorization header
            const response = await fetch(fileUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Failed to load PDF file');

            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);

            // Set up the PDF viewer component after loading
            this.removeAll(); // Clear loading placeholder
            const pdfFrame = this.add({
                xtype: 'component',
                itemId: 'pdfFrame',
                autoEl: {
                    tag: 'iframe',
                    src: objectURL,
                    tabindex: 0,
                    style: 'width: 100%; height: 100%; border: none; pointer-events: auto;'
                }
            });

            this.on('beforeclose', function() {
                URL.revokeObjectURL(objectURL);
            }, this, { single: true });

            Ext.defer(function() {
                me.focusPdfFrame(pdfFrame);
            }, 150);
        } catch (error) {
            Ext.Msg.alert('Error', 'Failed to load the PDF file: ' + error.message);
            this.close();
        }
    },

    focusPdfFrame: function(pdfFrame) {
        const frameComponent = pdfFrame || this.down('#pdfFrame');
        const frameEl = frameComponent && frameComponent.getEl ? frameComponent.getEl() : null;
        const frameDom = frameEl && frameEl.dom ? frameEl.dom : null;

        if (!frameDom) {
            return;
        }

        frameEl.setStyle('pointer-events', 'auto');
        frameDom.style.pointerEvents = 'auto';

        try {
            frameDom.focus();
        } catch (error) {
            // Browser PDF viewers may refuse programmatic focus; clicks remain enabled.
        }
    }
});
