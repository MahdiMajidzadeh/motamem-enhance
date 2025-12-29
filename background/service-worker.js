// Background service worker for handling storage operations

// Import storage functions
importScripts('../shared/storage.js');

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['toRead', 'read'], (data) => {
    if (!data.toRead) {
      chrome.storage.local.set({ toRead: [] });
    }
    if (!data.read) {
      chrome.storage.local.set({ read: [] });
    }
  });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  (async () => {
    try {
      switch (request.action) {
        case 'addToRead':
          await addToRead(request.url, request.title);
          sendResponse({ success: true });
          break;
          
        case 'addToReadList':
          await addToReadList(request.url, request.title);
          sendResponse({ success: true });
          break;
          
        case 'removeFromList':
          await removeFromList(request.url, request.listType);
          sendResponse({ success: true });
          break;
          
        case 'movePost':
          await movePost(request.url, request.fromList, request.toList);
          sendResponse({ success: true });
          break;
          
        case 'getAllPosts':
          const result = await getAllPosts(request.listType, request.page, request.pageSize);
          sendResponse({ success: true, data: result });
          break;
          
        case 'getPostStatus':
          const status = await getPostStatus(request.url);
          sendResponse({ success: true, status });
          break;
          
        case 'getCounts':
          const counts = await getCounts();
          sendResponse({ success: true, counts });
          break;
          
        case 'exportData':
          const exportedData = await exportData();
          sendResponse({ success: true, data: exportedData });
          break;
          
        case 'importData':
          const importResult = await importData(request.data);
          sendResponse({ success: true, result: importResult });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

