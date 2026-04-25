// ViewerFactory.js
Ext.define('FileManagement.components.viewers.ViewerFactory', {
    singleton: true,

    requires: [
        'FileManagement.components.viewers.AudioViewer',
        'FileManagement.components.viewers.HtmlViewer',
        'FileManagement.components.utils.PanelUtils'
    ],

    createViewer: function(record) {
        const fileType = record.get('mimetype') || record.get('type') || '';
        const fileId = record.get('id');
        const fileName = record.get('name');
        const isShared = !!record.get('isShared');
        const permission = record.get('permission');
        const mainPanel = Ext.getCmp('mainPanelRegion');

        let viewer;

        if (fileType.startsWith('audio/')) {
            viewer = Ext.ComponentQuery.query('audioviewer')[0];

            if (viewer && !viewer.destroyed) {
                viewer.loadTrack({
                    fileId,
                    fileName,
                    mimeType: fileType,
                    autoPlay: true
                });
                FileManagement.components.utils.PanelUtils.restoreFromTaskbar(viewer);
                return viewer;
            }

            viewer = Ext.create('FileManagement.components.viewers.AudioViewer', {
                title: `Audio Player: ${fileName}`,
                fileId,
                fileName,
                mimeType: fileType,
                autoPlay: true
            });
        } else if (fileType.startsWith('image/')) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.ImageViewer', {
                src: fileUrl,
                title: `Image: ${fileName}`,
                fileId,
                isShared,
                permission
            });
        } else if (fileType === 'application/pdf') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.PDFViewer', {
                src: fileUrl,
                title: `PDF: ${fileName}`
            });
        } else if (fileType === 'text/html' || fileType === 'application/xhtml+xml') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.HtmlViewer', {
                src: fileUrl,
                title: `HTML Preview: ${fileName}`,
                fileName
            });
        } else if (fileType.startsWith('application/vnd') || fileType.includes('msword')) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.OfficeDocumentViewer', {
                src: fileUrl,
                title: `Office Document Viewer: ${fileName}`
            });
        } else if (['text/plain', 'application/json'].includes(fileType)) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.TextViewer', {
                src: fileUrl,
                fileId,
                title: `Text Viewer: ${fileName}`,
                isShared,
                permission
            });
        } else if (fileType === 'application/zip') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.ZipViewer', {
                src: fileUrl,
                fileName: fileName,
                filePath: record.get('path'),
                title: `Zip File Contents: ${fileName}`,
                isShared,
                permission
            });
        } else if (fileType.startsWith('video/')) {
            viewer = Ext.create('FileManagement.components.viewers.VideoViewer', {
                title: `Video Viewer: ${fileName}`,
                fileId,
                autoPlay: false
            });
        } else {
            Ext.Msg.alert('Unsupported File Type', 'The selected file type is not supported for viewing.');
            return;
        }

        viewer.show = function () {
            if (!viewer.ownerCt) {
                mainPanel.add(viewer); // Add the viewer panel to the main region
            } else if (viewer.hidden && Ext.isFunction(Ext.panel.Panel.prototype.show)) {
                Ext.panel.Panel.prototype.show.call(viewer);
            }

            FileManagement.components.utils.PanelUtils.prepareWorkspacePanel(viewer);
            FileManagement.components.utils.PanelUtils.activateWorkspacePanel(viewer);
            FileManagement.components.utils.PanelUtils.updateNavigationPanelList();
        };

        return viewer;
    }
});
