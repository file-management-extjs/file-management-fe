// Upload Worker
let activeUploads = 0;
const maxConcurrentUploads = 3;
const uploadQueue = [];

// Dynamic chunk size calculation based on file size
function calculateChunkSize(fileSize) {
    // For files smaller than 100MB, use smaller chunks
    if (fileSize < 100 * 1024 * 1024) {
        return 2 * 1024 * 1024; // 2MB chunks
    }
    // For files between 100MB and 1GB
    else if (fileSize < 1024 * 1024 * 1024) {
        return 5 * 1024 * 1024; // 5MB chunks
    }
    // For files larger than 1GB
    else {
        return 10 * 1024 * 1024; // 10MB chunks
    }
}

function uploadChunk(formData, url, headers) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                self.postMessage({
                    type: 'progress',
                    loaded: event.loaded,
                    total: event.total,
                    headers: headers
                });
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                resolve(xhr.response);
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        
        xhr.send(formData);
    });
}

async function processUpload(file, folderId) {
    try {
        const chunkSize = calculateChunkSize(file.size);
        const totalChunks = Math.ceil(file.size / chunkSize);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);

            const headers = {
                'X-File-Name': file.name,
                'X-Chunk-Index': chunkIndex.toString(),
                'X-Total-Chunks': totalChunks.toString()
            };

            const formData = new FormData();
            formData.append('chunk', new Blob([chunk], { type: 'application/octet-stream' }));
            formData.append('filename', file.name);
            formData.append('currentChunk', chunkIndex.toString());
            formData.append('totalChunks', totalChunks.toString());
            if (folderId) {
                formData.append('folderId', folderId);
            }

            await uploadChunk(formData, 'http://localhost:5000/api/files/upload', headers);
        }

        self.postMessage({
            type: 'complete',
            fileName: file.name
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            fileName: file.name,
            error: error.message
        });
    }
}

async function processQueue() {
    while (uploadQueue.length > 0 && activeUploads < maxConcurrentUploads) {
        activeUploads++;
        const file = uploadQueue.shift();
        await processUpload(file, file.folderId);
        activeUploads--;
        
        // Continue processing queue
        processQueue();
    }
}

self.onmessage = function(e) {
    switch (e.data.type) {
        case 'upload':
            uploadQueue.push(e.data.file);
            processQueue();
            break;
            
        case 'cancel':
            // Implement cancel logic here
            break;
    }
};
