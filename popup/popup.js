const storageKey = 'motamemTrackedArticles';
const articleListDiv = document.getElementById('article-list');
const exportButton = document.getElementById('export-csv');

async function loadArticles() {
    articleListDiv.innerHTML = '<p class="loading">Loading articles...</p>'; // Show loading message

    try {
        const data = await chrome.storage.local.get(storageKey);
        const articles = data[storageKey] || {};
        const sortedArticles = Object.values(articles).sort((a, b) => b.timestamp - a.timestamp); // Sort by most recent first

        if (sortedArticles.length === 0) {
            articleListDiv.innerHTML = '<p class="empty-list">No articles tracked yet.</p>';
            return;
        }

        articleListDiv.innerHTML = ''; // Clear loading/empty message

        sortedArticles.forEach(article => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'article-item';
            itemDiv.dataset.url = article.url; // Store URL for deletion

            const statusClass = article.status === 'Read' ? 'status-read' : 'status-want-to-read';
            const formattedDate = new Date(article.timestamp).toLocaleString(undefined, {
                 dateStyle: 'short', timeStyle: 'short'
                }); // Use locale-specific format

            itemDiv.innerHTML = `
                <div class="article-info">
                    <span class="article-title">
                        <a href="${article.url}" target="_blank" title="Open article: ${article.title}">${article.title}</a>
                    </span>
                    <div class="article-meta">
                        <span class="article-status ${statusClass}">${article.status.replace('-', ' ')}</span>
                        <span>Added: ${formattedDate}</span>
                    </div>
                </div>
                <div class="article-actions">
                    <button class="delete-btn" title="Remove from list">×</button>
                </div>
            `;

            articleListDiv.appendChild(itemDiv);
        });

        // Add event listeners for delete buttons after creating them
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDeleteArticle);
        });

    } catch (error) {
        console.error("Error loading articles:", error);
        articleListDiv.innerHTML = '<p class="error">Error loading articles. Check console.</p>';
    }
}

async function handleDeleteArticle(event) {
    const itemDiv = event.target.closest('.article-item');
    const urlToDelete = itemDiv.dataset.url;

    if (!urlToDelete || !confirm(`Are you sure you want to remove "${itemDiv.querySelector('.article-title a').textContent}" from the list?`)) {
        return;
    }

    try {
        const data = await chrome.storage.local.get(storageKey);
        const articles = data[storageKey] || {};

        if (articles[urlToDelete]) {
            delete articles[urlToDelete];
            await chrome.storage.local.set({ [storageKey]: articles });
            console.log(`Removed article: ${urlToDelete}`);
            loadArticles(); // Refresh the list in the popup
        }
    } catch (error) {
        console.error("Error deleting article:", error);
        alert("Failed to remove the article.");
    }
}


function exportToCSV() {
    chrome.storage.local.get(storageKey, (data) => {
        const articles = data[storageKey] || {};
        const articleArray = Object.values(articles);

        if (articleArray.length === 0) {
            alert("No articles to export.");
            return;
        }

        // Define CSV Header
        const csvHeader = ['Title', 'URL', 'Status', 'Timestamp', 'Date Added'];
        // Map data to CSV rows
        const csvRows = articleArray.map(article => [
            `"${article.title.replace(/"/g, '""')}"`, // Escape double quotes
            `"${article.url}"`,
            `"${article.status}"`,
            article.timestamp,
            `"${new Date(article.timestamp).toISOString()}"` // ISO format is good for data
        ]);

        // Combine header and rows
        const csvContent = [
            csvHeader.join(','),
            ...csvRows.map(row => row.join(','))
        ].join('\n');

        // Create Blob and Trigger Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const filename = `motamem_articles_${dateStr}.csv`;

        // Use the chrome.downloads API
         try {
             chrome.downloads.download({
                url: URL.createObjectURL(blob),
                filename: filename,
                saveAs: true // Ask user where to save
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error("Download failed:", chrome.runtime.lastError.message);
                    alert("Failed to initiate download. Check extension permissions or console logs.");
                 } else {
                    console.log("Download initiated with ID:", downloadId);
                 }
            });
         } catch (e) {
            console.error("Error calling chrome.downloads.download:", e);
            alert("An error occurred trying to export. Make sure the 'downloads' permission is granted.");
         }
    });
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadArticles);
exportButton.addEventListener('click', exportToCSV);