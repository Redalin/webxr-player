document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const serverPathInput = document.getElementById('server-path-input');
  const btnLoadPath = document.getElementById('btn-load-path');
  const btnBrowseFS = document.getElementById('btn-browse-fs');
  const localFileInput = document.getElementById('local-file-input');
  const videoGrid = document.getElementById('video-grid');
  const loadingSpinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const currentPathLabel = document.getElementById('current-path-label');
  const videoSearchInput = document.getElementById('video-search-input');
  const filter3DMode = document.getElementById('filter-3d-mode');
  const presetFolders = document.getElementById('preset-folders');
  const httpsWarningBanner = document.getElementById('https-warning-banner');
  const btnSwitchHttps = document.getElementById('btn-switch-https');

  // Modal Elements
  const fsModal = document.getElementById('fs-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalPathDisplay = document.getElementById('modal-path-display');
  const directoryList = document.getElementById('directory-list');
  const modalParentBtn = document.getElementById('modal-parent-btn');
  const modalSelectBtn = document.getElementById('modal-select-btn');

  // Player Elements
  const playerModal = document.getElementById('player-modal');
  const btnClosePlayer = document.getElementById('btn-close-player');
  const playerTitle = document.getElementById('player-title');
  const player3DBadge = document.getElementById('player-3d-badge');
  const btnEnterWebXR = document.getElementById('btn-enter-webxr');
  const btnEnterFullscreen3D = document.getElementById('btn-enter-fullscreen-3d');
  const webVideoElement = document.getElementById('web-video-element');
  const videoWrapper = document.getElementById('video-wrapper');
  const playerModeSelect = document.getElementById('player-mode-select');

  // State
  let currentPath = '/media';
  let modalCurrentPath = '/media';
  let loadedVideos = [];
  let localVideoFiles = [];
  let currentPlayingVideo = null;

  // Check Secure Context (HTTPS or localhost required for WebXR API)
  checkSecureContext();

  // Initialize
  loadDirectory('/media');

  // Event Listeners
  btnLoadPath.addEventListener('click', () => {
    const path = serverPathInput.value.trim();
    if (path) loadDirectory(path);
  });

  serverPathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const path = serverPathInput.value.trim();
      if (path) loadDirectory(path);
    }
  });

  presetFolders.addEventListener('click', (e) => {
    if (e.target.classList.contains('preset-chip')) {
      const path = e.target.getAttribute('data-path');
      serverPathInput.value = path;
      loadDirectory(path);
    }
  });

  // Local File Picker
  localFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleLocalFiles(files);
    }
  });

  // Search & Filters
  videoSearchInput.addEventListener('input', renderVideoGrid);
  filter3DMode.addEventListener('change', renderVideoGrid);

  // FS Modal Events
  btnBrowseFS.addEventListener('click', () => {
    openFSModal(currentPath);
  });

  modalCloseBtn.addEventListener('click', () => {
    fsModal.classList.remove('active');
  });

  modalSelectBtn.addEventListener('click', () => {
    fsModal.classList.remove('active');
    serverPathInput.value = modalCurrentPath;
    loadDirectory(modalCurrentPath);
  });

  modalParentBtn.addEventListener('click', () => {
    fetchBrowseData(modalCurrentPath).then(data => {
      if (data.parent) {
        openFSModal(data.parent);
      }
    });
  });

  // Player Events
  btnClosePlayer.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  // WebXR Launch
  btnEnterWebXR.addEventListener('click', () => {
    const selectedMode = playerModeSelect.value;
    if (!window.isSecureContext) {
      if (confirm("WebXR requires HTTPS context! Switch to https://" + window.location.hostname + ":8000 now?")) {
        window.location.href = `https://${window.location.hostname}:8000`;
      }
      return;
    }
    if (window.xrPlayer) {
      window.xrPlayer.startVRSession(webVideoElement, selectedMode);
    }
  });

  // Fullscreen 3D Playback for 3D/AR Glasses (XREAL / Rokid / Viture / 3D TVs)
  btnEnterFullscreen3D.addEventListener('click', () => {
    if (videoWrapper.requestFullscreen) {
      videoWrapper.requestFullscreen();
    } else if (videoWrapper.webkitRequestFullscreen) {
      videoWrapper.webkitRequestFullscreen();
    }
  });

  playerModeSelect.addEventListener('change', (e) => {
    if (currentPlayingVideo) {
      currentPlayingVideo.mode_3d = e.target.value;
      updatePlayerBadge(e.target.value);
    }
  });

  function checkSecureContext() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      if (httpsWarningBanner) httpsWarningBanner.style.display = 'block';
    }

    if (btnSwitchHttps) {
      btnSwitchHttps.addEventListener('click', () => {
        window.location.href = `https://${window.location.hostname}:8000`;
      });
    }
  }

  // API Call Functions
  async function loadDirectory(path) {
    showLoading(true);
    localVideoFiles = []; // Reset local files on server dir change

    try {
      const data = await fetchBrowseData(path);
      currentPath = data.current;
      serverPathInput.value = currentPath;
      currentPathLabel.textContent = currentPath;

      loadedVideos = data.videos || [];
      renderVideoGrid();
    } catch (err) {
      console.error("Failed to load directory:", err);
      alert("Error scanning directory: " + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchBrowseData(path) {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return await res.json();
  }

  async function openFSModal(path) {
    fsModal.classList.add('active');
    modalCurrentPath = path;
    modalPathDisplay.textContent = path;
    directoryList.innerHTML = '<p style="color: var(--text-muted);">Loading directories...</p>';

    try {
      const data = await fetchBrowseData(path);
      modalCurrentPath = data.current;
      modalPathDisplay.textContent = modalCurrentPath;

      directoryList.innerHTML = '';
      if (data.directories.length === 0) {
        directoryList.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No subdirectories found.</p>';
      } else {
        data.directories.forEach(dir => {
          const item = document.createElement('div');
          item.className = 'dir-item';
          item.innerHTML = `<span>📁</span> <strong>${dir.name}</strong>`;
          item.addEventListener('click', () => openFSModal(dir.path));
          directoryList.appendChild(item);
        });
      }
    } catch (err) {
      directoryList.innerHTML = `<p style="color: #ef4444;">Error: ${err.message}</p>`;
    }
  }

  function handleLocalFiles(files) {
    localVideoFiles = files.map(file => ({
      name: file.name,
      path: null,
      fileObject: file,
      size: file.size,
      formatted_size: formatBytes(file.size),
      duration: 0,
      formatted_duration: '--:--',
      width: 0,
      height: 0,
      mode_3d: detect3DModeFromFilename(file.name),
      isLocal: true,
      blobUrl: URL.createObjectURL(file)
    }));

    renderVideoGrid();
  }

  function renderVideoGrid() {
    videoGrid.innerHTML = '';
    const searchQuery = videoSearchInput.value.toLowerCase().trim();
    const filterMode = filter3DMode.value;

    const allVideos = [...localVideoFiles, ...loadedVideos];

    const filtered = allVideos.filter(vid => {
      const matchesSearch = vid.name.toLowerCase().includes(searchQuery);
      let matchesFilter = true;
      if (filterMode === '3d') matchesFilter = vid.mode_3d !== '2d';
      if (filterMode === '2d') matchesFilter = vid.mode_3d === '2d';
      return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    filtered.forEach(vid => {
      const card = createVideoCard(vid);
      videoGrid.appendChild(card);
    });
  }

  function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const thumbUrl = video.isLocal
      ? '/static/img/video-placeholder.svg'
      : `/api/thumbnail?path=${encodeURIComponent(video.path)}`;

    const is3D = video.mode_3d !== '2d';
    const badgeClass = is3D ? 'badge-3d' : 'badge-2d';
    const badgeText = get3DBadgeText(video.mode_3d);

    card.innerHTML = `
      <div class="thumb-container">
        <img class="thumb-img" src="${thumbUrl}" alt="${video.name}" loading="lazy" onerror="this.src='/api/thumbnail?path=${encodeURIComponent(video.path)}'">
        <div class="play-overlay">
          <div class="play-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <span class="mode-badge ${badgeClass}">${badgeText}</span>
        <span class="duration-badge">${video.formatted_duration || '00:00'}</span>
      </div>
      <div class="video-info">
        <div class="video-title" title="${video.name}">${video.name}</div>
        <div class="meta-tags">
          ${video.width ? `<span class="meta-tag">${video.width}x${video.height}</span>` : ''}
          <span class="meta-tag">${video.formatted_size}</span>
          ${video.codec ? `<span class="meta-tag">${video.codec}</span>` : ''}
        </div>
        <div class="card-footer">
          <select class="mode-selector-select" data-role="mode-select">
            <option value="2d" ${video.mode_3d === '2d' ? 'selected' : ''}>2D Flat</option>
            <option value="3d_sbs" ${video.mode_3d === '3d_sbs' ? 'selected' : ''}>3D SBS</option>
            <option value="3d_tb" ${video.mode_3d === '3d_tb' ? 'selected' : ''}>3D Top-Bottom</option>
            <option value="3d_180_sbs" ${video.mode_3d === '3d_180_sbs' ? 'selected' : ''}>3D 180° VR</option>
            <option value="3d_360_sbs" ${video.mode_3d === '3d_360_sbs' ? 'selected' : ''}>3D 360° VR</option>
          </select>
        </div>
      </div>
    `;

    // Dropdown change listener
    const modeSelect = card.querySelector('[data-role="mode-select"]');
    modeSelect.addEventListener('click', (e) => e.stopPropagation());
    modeSelect.addEventListener('change', (e) => {
      video.mode_3d = e.target.value;
      const badgeEl = card.querySelector('.mode-badge');
      badgeEl.textContent = get3DBadgeText(video.mode_3d);
      badgeEl.className = `mode-badge ${video.mode_3d !== '2d' ? 'badge-3d' : 'badge-2d'}`;
    });

    // Card click opens player
    card.addEventListener('click', () => {
      openPlayerModal(video);
    });

    return card;
  }

  function openPlayerModal(video) {
    currentPlayingVideo = video;
    playerTitle.textContent = video.name;
    playerModeSelect.value = video.mode_3d;
    updatePlayerBadge(video.mode_3d);

    const streamUrl = video.isLocal
      ? video.blobUrl
      : `/api/stream?path=${encodeURIComponent(video.path)}`;

    webVideoElement.src = streamUrl;
    playerModal.classList.add('active');
    webVideoElement.play().catch(e => console.log("Autoplay prevented:", e));
  }

  function closePlayerModal() {
    webVideoElement.pause();
    webVideoElement.src = '';
    playerModal.classList.remove('active');
    currentPlayingVideo = null;
    if (window.xrPlayer) {
      window.xrPlayer.exitVR();
    }
  }

  function updatePlayerBadge(mode3D) {
    player3DBadge.textContent = get3DBadgeText(mode3D);
    player3DBadge.className = `badge ${mode3D !== '2d' ? 'badge-3d' : 'badge-2d'}`;
  }

  function get3DBadgeText(mode) {
    switch(mode) {
      case '3d_sbs': return '3D SBS';
      case '3d_tb': return '3D TB';
      case '3d_180_sbs': return '3D 180°';
      case '3d_360_sbs': return '3D 360°';
      default: return '2D';
    }
  }

  function detect3DModeFromFilename(fn) {
    const f = fn.toLowerCase();
    if (f.includes('180')) return '3d_180_sbs';
    if (f.includes('360')) return '3d_360_sbs';
    if (f.includes('sbs') || f.includes('3d')) return '3d_sbs';
    if (f.includes('tb') || f.includes('ou')) return '3d_tb';
    return '2d';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function showLoading(isLoading) {
    loadingSpinner.style.display = isLoading ? 'block' : 'none';
    if (isLoading) emptyState.style.display = 'none';
  }
});
