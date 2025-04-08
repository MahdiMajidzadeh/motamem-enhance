console.log("Motamem Tracker Content Script Loaded");

const currentUrl = window.location.href;
const currentTitle = document.title;
const storageKey = 'motamemTrackedArticles';

let previewTimeout;
let previewPopup;
let currentPreviewUrl = null;

// --- Article Tracking Buttons ---

function createArticleTrackingButtons() {
    // Avoid adding buttons multiple times if script re-runs
    if (document.getElementById('motamem-tracker-container')) {
        updateButtonStates(); // Ensure states are correct on navigation
        return;
    }

    const container = document.createElement('div');
    container.id = 'motamem-tracker-container';
    container.className = 'motamem-tracker-container';

    const readButton = document.createElement('button');
    readButton.id = 'motamem-tracker-read';
    readButton.textContent = 'Mark as Read';
    readButton.className = 'motamem-tracker-button read';

    const wantToReadButton = document.createElement('button');
    wantToReadButton.id = 'motamem-tracker-want-to-read';
    wantToReadButton.textContent = 'Want to Read';
    wantToReadButton.className = 'motamem-tracker-button want-to-read';

    readButton.addEventListener('click', () => handleStatusUpdate('Read'));
    wantToReadButton.addEventListener('click', () => handleStatusUpdate('Want to Read'));

    container.appendChild(readButton);
    container.appendChild(wantToReadButton);
    document.body.appendChild(container);

    updateButtonStates();
}

async function handleStatusUpdate(status) {
    try {
        const data = await chrome.storage.local.get(storageKey);
        const articles = data[storageKey] || {};

        // Check if already marked with the *same* status
        if (articles[currentUrl] && articles[currentUrl].status === status) {
            // If clicking the same status again, remove it
            delete articles[currentUrl];
             console.log(`Removed tracking for: ${currentUrl}`);
        } else {
            // Otherwise, add or update the status
            articles[currentUrl] = {
                title: currentTitle,
                url: currentUrl,
                status: status,
                timestamp: Date.now()
            };
             console.log(`Article "${currentTitle}" marked as "${status}"`);
        }

        await chrome.storage.local.set({ [storageKey]: articles });
        updateButtonStates(); // Update button appearance after saving

    } catch (error) {
        console.error("Error saving article status:", error);
    }
}

async function updateButtonStates() {
    const readButton = document.getElementById('motamem-tracker-read');
    const wantToReadButton = document.getElementById('motamem-tracker-want-to-read');

    if (!readButton || !wantToReadButton) return; // Buttons not created yet

    try {
        const data = await chrome.storage.local.get(storageKey);
        const articles = data[storageKey] || {};
        const currentArticle = articles[currentUrl];

        // Reset styles
        readButton.classList.remove('active', 'disabled');
        wantToReadButton.classList.remove('active', 'disabled');
        readButton.textContent = 'Mark as Read';
        wantToReadButton.textContent = 'Want to Read';

        if (currentArticle) {
            if (currentArticle.status === 'Read') {
                readButton.classList.add('active');
                readButton.textContent = '✓ Read'; // Indicate it's marked
                wantToReadButton.classList.add('disabled'); // Can't mark 'Want to Read' if already 'Read'
            } else if (currentArticle.status === 'Want to Read') {
                wantToReadButton.classList.add('active');
                wantToReadButton.textContent = '★ Want to Read'; // Indicate it's marked
                readButton.classList.remove('disabled'); // Can still mark as 'Read'
            }
        }
    } catch (error) {
        console.error("Error updating button states:", error);
    }
}


// --- Link Preview ---

function createPreviewPopup() {
    if (!previewPopup) {
        previewPopup = document.createElement('div');
        previewPopup.id = 'motamem-link-preview';
        document.body.appendChild(previewPopup);
    }
    return previewPopup;
}

function showPreview(event) {
    const link = event.target.closest('a');
    if (!link || !link.href || !link.href.startsWith('https://motamem.org/') || link.href === window.location.href) {
         // Don't preview non-motamem links or links to the current page
        return;
    }

     // Debounce: Clear any existing timeout to fetch preview
     clearTimeout(previewTimeout);
     currentPreviewUrl = link.href; // Store the URL we are about to preview


    previewTimeout = setTimeout(async () => {
        // Check if the mouse is still over the *same* link after the delay
        if (link.matches(':hover') && currentPreviewUrl === link.href) {
            const popup = createPreviewPopup();
            popup.innerHTML = '<div class="loading">Loading preview...</div>'; // Show loading indicator
            popup.classList.add('visible');
            positionPopup(popup, event); // Position near the mouse/link

            try {
                // Fetch the target page content
                 // Use 'no-cors' mode ONLY IF NECESSARY, ideally rely on host permissions.
                 // Note: 'no-cors' prevents reading the response body directly in JS!
                 // For same-origin or allowed cross-origin (via manifest), standard fetch is fine.
                const response = await fetch(link.href);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const text = await response.text();

                // Basic parsing to get title and description/first paragraph
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                
                const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
                const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
                const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
                
                const previewTitle = ogTitle || doc.querySelector('title')?.textContent || 'No Title Found';
                let previewDesc = ogDescription
                    || doc.querySelector('meta[name="description"]')?.getAttribute('content')
                    || doc.querySelector('p')?.textContent
                    || 'No description available.';
                
                previewDesc = previewDesc.trim().substring(0, 250) + (previewDesc.length > 250 ? '...' : '');
                
                // Check again if we are still supposed to show this preview
                if (currentPreviewUrl !== link.href) {
                    hidePreview();
                    return;
                }

                let imageSection = '';
                if (ogImage) {
                    imageSection = `<img src="${ogImage}" alt="Preview Image" style="width:100%;height:auto;margin-bottom:8px;">`;
                }

                popup.innerHTML = `
                    ${imageSection}
                    <h4>${previewTitle}</h4>
                    <p>${previewDesc}</p>
                `;
                positionPopup(popup, event); // Re-position after content loaded

            } catch (error) {
                console.error('Error fetching preview:', error);
                 if (currentPreviewUrl === link.href) { // Only show error if still relevant
                    popup.innerHTML = `<div class="error">Could not load preview.</div>`;
                    positionPopup(popup, event);
                } else {
                    hidePreview(); // Hide if irrelevant now
                }
            }
        }
    }, 500); // 500ms delay before fetching
}

function hidePreview() {
     clearTimeout(previewTimeout); // Cancel any pending fetch/show
     currentPreviewUrl = null; // Reset the currently intended preview URL
    if (previewPopup) {
        previewPopup.classList.remove('visible');
        // Optional: Could remove the popup from DOM completely on hide,
        // or just hide it via CSS opacity/display for performance. Hiding is usually fine.
         // previewPopup.remove();
         // previewPopup = null;
    }
}

function positionPopup(popupElement, event) {
     // Position near the mouse cursor
     let top = event.pageY + 15; // Below cursor
     let left = event.pageX + 10; // Right of cursor

     // Adjust if popup goes off screen
     const PADDING = 10; // Padding from viewport edge
     const popupRect = popupElement.getBoundingClientRect(); // Get dimensions *after* content is added (important!)

     // Check right edge
     if (left + popupRect.width > window.innerWidth - PADDING) {
        left = event.pageX - popupRect.width - 10; // Move to the left of cursor
     }
     // Check bottom edge
     if (top + popupRect.height > window.innerHeight + window.scrollY - PADDING) {
         top = event.pageY - popupRect.height - 15; // Move above cursor
     }
     // Check left edge (if moved left previously)
     if (left < PADDING) {
        left = PADDING;
     }
      // Check top edge (if moved top previously)
     if (top < window.scrollY + PADDING) {
        top = window.scrollY + PADDING;
     }

    popupElement.style.left = `${left}px`;
    popupElement.style.top = `${top}px`;
}


function addLinkListeners() {
    // Select links within the main content area if possible, otherwise all links
    // This requires inspecting Motamem's HTML structure. Let's assume a common main content ID or class.
    // Example: const contentArea = document.querySelector('#main-content') || document.body;
    // For now, let's attach to all links within the body
    document.body.addEventListener('mouseover', showPreview);
    document.body.addEventListener('mouseout', hidePreview);
}


// --- Initialization ---
function init() {
    // Check if we are likely on an article page (heuristic)
    // Motamem URLs often contain numbers or specific paths.
    // This is a basic check, might need refinement based on exact URL patterns.
    if (window.location.pathname.length > 1 && /\d/.test(window.location.pathname)) { // Simple check for non-root paths with numbers
        createArticleTrackingButtons();
    } else {
        console.log("Not detected as a potential article page, skipping tracking buttons.");
    }

    addLinkListeners();
}

// Run the initialization logic
init();

// Handle potential SPA navigations (if Motamem uses them heavily)
// This is a more advanced feature. For simple page loads, the initial run is enough.
// let lastUrl = location.href;
// new MutationObserver(() => {
//   const url = location.href;
//   if (url !== lastUrl) {
//     lastUrl = url;
//     // Potentially re-run init() or parts of it after a short delay
//     setTimeout(init, 500);
//   }
// }).observe(document, {subtree: true, childList: true});