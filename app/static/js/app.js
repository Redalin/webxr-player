document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const serverPathInput = document.getElementById('server-path-input');
  const btnLoadPath = document.getElementById('btn-load-path');
  const btnBrowseFS = document.getElementById('btn-browse-fs');
  const localFileInput = document.getElementById('local-file-input');
  const videoGrid = document.getElementById('video-grid');
  const loadingSpinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const pathBreadcrumb = document.getElementById('path-breadcrumb');
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

  // Player & Overlay Elements
  const playerModal = document.getElementById('player-modal');
  const btnClosePlayer = document.getElementById('btn-close-player');
  const playerTitle = document.getElementById('player-title');
  const player3DBadge = document.getElementById('player-3d-badge');
  const btnEnterWebXR = document.getElementById('btn-enter-webxr');
  const btnEnterFullscreen3D = document.getElementById('btn-enter-fullscreen-3d');
  const webVideoElement = document.getElementById('web-video-element');
  const videoWrapper = document.getElementById('video-wrapper');
  const playerModeSelect = document.getElementById('player-mode-select');

  // Overlay Controls
  const fullscreenOverlayBar = document.getElementById('fullscreen-overlay-bar');
  const overlayBtnPlay = document.getElementById('overlay-btn-play');
  const overlayPlayIcon = document.getElementById('overlay-play-icon');
  const overlayPlayText = document.getElementById('overlay-play-text');
  const overlayBtnMute = document.getElementById('overlay-btn-mute');
  const overlayMuteIcon = document.getElementById('overlay-mute-icon');
  const overlayMuteText = document.getElementById('overlay-mute-text');
  const overlaySeekBar = document.getElementById('overlay-seek-bar');
  const overlayTimeCurrent = document.getElementById('overlay-time-current');
  const overlayTimeTotal = document.getElementById('overlay-time-total');
  const overlayModeSelect = document.getElementById('overlay-mode-select');
  const overlayBtnExitVr = document.getElementById('overlay-btn-exit-vr');
  const overlayBtnExitVideo = document.getElementById('overlay-btn-exit-video');

  // State
  let currentPath = '/media';
  let loadedDirectories = [];
  let loadedVideos = [];
  let localVideoFiles = [];
  let parentDirectory = null;
  let currentPlayingVideo = null;
  let autoHideTimer = null;
  let isSeeking = false;

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

  // Favorites / Quick Locations
  let favoritePaths = [];
  try {
    const saved = localStorage.getItem('webxr_favorite_folders');
    favoritePaths = saved ? JSON.parse(saved) : ['/media', '/app/media', '/app'];
  } catch(e) {
    favoritePaths = ['/media', '/app/media', '/app'];
  }

  const btnToggleFavorite = document.getElementById('btn-toggle-favorite');

  function saveFavorites() {
    try {
      localStorage.setItem('webxr_favorite_folders', JSON.stringify(favoritePaths));
    } catch(e) {}
    renderFavorites();
    updateFavoriteStar();
  }

  function updateFavoriteStar() {
    if (!btnToggleFavorite) return;
    const isFav = favoritePaths.includes(currentPath);
    if (isFav) {
      btnToggleFavorite.classList.add('active');
      btnToggleFavorite.title = `Remove ${currentPath} from Quick Locations`;
    } else {
      btnToggleFavorite.classList.remove('active');
      btnToggleFavorite.title = `Save ${currentPath} to Quick Locations`;
    }
  }

  function renderFavorites() {
    if (!presetFolders) return;
    presetFolders.innerHTML = '<span class="preset-label">Quick Locations:</span>';
    favoritePaths.forEach(path => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preset-chip-wrapper';
      wrapper.innerHTML = `
        <button class="preset-chip" data-path="${path}" title="${path}">${path}</button>
        <span class="preset-remove" data-path="${path}" title="Remove ${path}">×</span>
      `;

      wrapper.querySelector('.preset-chip').addEventListener('click', () => {
        serverPathInput.value = path;
        loadDirectory(path);
      });

      wrapper.querySelector('.preset-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        favoritePaths = favoritePaths.filter(p => p !== path);
        saveFavorites();
      });

      presetFolders.appendChild(wrapper);
    });
  }

  if (btnToggleFavorite) {
    btnToggleFavorite.addEventListener('click', () => {
      if (!currentPath) return;
      if (favoritePaths.includes(currentPath)) {
        favoritePaths = favoritePaths.filter(p => p !== currentPath);
      } else {
        favoritePaths.push(currentPath);
      }
      saveFavorites();
    });
  }

  renderFavorites();

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
      if (confirm("WebXR requires HTTPS context! Switch to https://" + window.location.hostname + ":8443 now?")) {
        window.location.href = `https://${window.location.hostname}:8443`;
      }
      return;
    }
    if (window.xrPlayer) {
      window.xrPlayer.startVRSession(webVideoElement, selectedMode);
    }
  });

  // Fullscreen 3D Playback for 3D/AR Glasses
  btnEnterFullscreen3D.addEventListener('click', () => {
    if (videoWrapper.requestFullscreen) {
      videoWrapper.requestFullscreen();
    } else if (videoWrapper.webkitRequestFullscreen) {
      videoWrapper.webkitRequestFullscreen();
    }
    showOverlayBar();
  });

  // ------------------------------------------------------------------
  // Interactive Popup Control Bar Logic (Cursor Click in Fullscreen/Player)
  // ------------------------------------------------------------------
  videoWrapper.addEventListener('click', (e) => {
    // If click was inside overlay control bar controls, don't toggle
    if (e.target.closest('.overlay-control-bar')) return;
    
    if (fullscreenOverlayBar.classList.contains('fade-out')) {
      showOverlayBar();
    } else {
      hideOverlayBar();
    }
  });

  videoWrapper.addEventListener('mousemove', () => {
    showOverlayBar();
  });

  function showOverlayBar() {
    fullscreenOverlayBar.classList.remove('fade-out');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (!webVideoElement.paused && !isSeeking) {
        hideOverlayBar();
      }
    }, 4000);
  }

  function hideOverlayBar() {
    fullscreenOverlayBar.classList.add('fade-out');
  }

  // Play / Pause Toggle
  overlayBtnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if (webVideoElement.paused) {
      webVideoElement.play();
    } else {
      webVideoElement.pause();
    }
  });

  if (overlayBtnMute) {
    overlayBtnMute.addEventListener('click', (e) => {
      e.stopPropagation();
      webVideoElement.muted = !webVideoElement.muted;
      updateMuteUI();
    });
  }

  function updateMuteUI() {
    if (webVideoElement.muted) {
      if (overlayMuteIcon) overlayMuteIcon.textContent = '🔇';
      if (overlayMuteText) overlayMuteText.textContent = 'Unmute';
    } else {
      if (overlayMuteIcon) overlayMuteIcon.textContent = '🔊';
      if (overlayMuteText) overlayMuteText.textContent = 'Mute';
    }
  }

  webVideoElement.addEventListener('play', () => {
    overlayPlayIcon.textContent = '⏸';
    overlayPlayText.textContent = 'Pause';
  });

  webVideoElement.addEventListener('pause', () => {
    overlayPlayIcon.textContent = '▶';
    overlayPlayText.textContent = 'Play';
    showOverlayBar();
  });

  // Video Progress & Seek
  webVideoElement.addEventListener('timeupdate', () => {
    if (!isSeeking && webVideoElement.duration) {
      const pct = (webVideoElement.currentTime / webVideoElement.duration) * 100;
      overlaySeekBar.value = pct;
      overlayTimeCurrent.textContent = formatTime(webVideoElement.currentTime);
      overlayTimeTotal.textContent = formatTime(webVideoElement.duration);
    }
  });

  overlaySeekBar.addEventListener('mousedown', () => { isSeeking = true; });
  overlaySeekBar.addEventListener('touchstart', () => { isSeeking = true; });
  
  overlaySeekBar.addEventListener('input', (e) => {
    e.stopPropagation();
    if (webVideoElement.duration) {
      const targetTime = (e.target.value / 100) * webVideoElement.duration;
      overlayTimeCurrent.textContent = formatTime(targetTime);
    }
  });

  overlaySeekBar.addEventListener('change', (e) => {
    e.stopPropagation();
    if (webVideoElement.duration) {
      webVideoElement.currentTime = (e.target.value / 100) * webVideoElement.duration;
    }
    isSeeking = false;
  });

  // Dynamic 3D Projection Selection
  overlayModeSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    const newMode = e.target.value;
    playerModeSelect.value = newMode;
    if (currentPlayingVideo) {
      currentPlayingVideo.mode_3d = newMode;
      updatePlayerBadge(newMode);
    }
    if (window.xrPlayer) {
      window.xrPlayer.setProjectionMode(newMode);
    }
  });

  playerModeSelect.addEventListener('change', (e) => {
    const newMode = e.target.value;
    overlayModeSelect.value = newMode;
    if (currentPlayingVideo) {
      currentPlayingVideo.mode_3d = newMode;
      updatePlayerBadge(newMode);
    }
    if (window.xrPlayer) {
      window.xrPlayer.setProjectionMode(newMode);
    }
  });

  // Exit VR / Fullscreen
  overlayBtnExitVr.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    if (window.xrPlayer) {
      window.xrPlayer.exitVR();
    }
    showOverlayBar();
  });

  // Exit Video completely
  overlayBtnExitVideo.addEventListener('click', (e) => {
    e.stopPropagation();
    closePlayerModal();
  });

  function checkSecureContext() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn("🔒 Auto-redirecting HTTP request to HTTPS for WebXR secure context...");
      const httpsPort = '8443';
      const newUrl = `https://${window.location.hostname}:${httpsPort}${window.location.pathname}${window.location.search}`;
      window.location.replace(newUrl);
      return;
    }

    if (!isHttps && !isLocalhost && httpsWarningBanner) {
      httpsWarningBanner.style.display = 'block';
    }

    if (btnSwitchHttps) {
      btnSwitchHttps.addEventListener('click', () => {
        window.location.href = `https://${window.location.hostname}:8443`;
      });
    }
  }

  function renderBreadcrumbs(pathStr) {
    if (!pathBreadcrumb) return;
    pathBreadcrumb.innerHTML = '<span class="breadcrumb-label">Path:</span>';

    const normalized = (pathStr || '/media').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(p => p.length > 0);

    // 1. Root Segment (/)
    const rootSegment = document.createElement('button');
    rootSegment.className = `breadcrumb-segment ${parts.length === 0 ? 'active' : ''}`;
    rootSegment.title = 'Root directory /';
    rootSegment.innerHTML = '<span>🏠</span> <span>/</span>';
    rootSegment.addEventListener('click', () => loadDirectory('/'));
    pathBreadcrumb.appendChild(rootSegment);

    // 2. Path Segments
    let currentAcc = '';
    parts.forEach((part, index) => {
      currentAcc += '/' + part;
      const targetPath = currentAcc;
      const isLast = (index === parts.length - 1);

      // Separator /
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '/';
      pathBreadcrumb.appendChild(sep);

      // Segment Button
      const segBtn = document.createElement('button');
      segBtn.className = `breadcrumb-segment ${isLast ? 'active' : ''}`;
      segBtn.title = targetPath;
      segBtn.innerHTML = `<span>📁</span> <span>${part}</span>`;
      segBtn.addEventListener('click', () => loadDirectory(targetPath));
      pathBreadcrumb.appendChild(segBtn);
    });

    // 3. Append ⭐ Star Favorite Button for current path
    if (btnToggleFavorite) {
      pathBreadcrumb.appendChild(btnToggleFavorite);
    }
  }

  // API Call Functions
  async function loadDirectory(path) {
    showLoading(true);
    localVideoFiles = [];

    try {
      const data = await fetchBrowseData(path);
      currentPath = data.current;
      parentDirectory = (data.parent && data.parent !== currentPath) ? data.parent : null;
      serverPathInput.value = currentPath;
      if (currentPathLabel) {
        currentPathLabel.textContent = currentPath;
        currentPathLabel.title = currentPath;
      }
      renderBreadcrumbs(currentPath);
      updateFavoriteStar();

      loadedDirectories = data.directories || [];
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
    modalPathDisplay.title = path;
    directoryList.innerHTML = '<p style="color: var(--text-muted);">Loading directories...</p>';

    try {
      const data = await fetchBrowseData(path);
      modalCurrentPath = data.current;
      modalPathDisplay.textContent = modalCurrentPath;
      modalPathDisplay.title = modalCurrentPath;

      directoryList.innerHTML = '';
      if (data.directories.length === 0) {
        directoryList.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No subdirectories found.</p>';
      } else {
        data.directories.forEach(dir => {
          const item = document.createElement('div');
          item.className = 'dir-item';
          item.title = dir.name;
          item.innerHTML = `<span>📁</span> <strong title="${dir.name}">${dir.name}</strong>`;
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

    const filteredDirs = loadedDirectories.filter(dir =>
      dir.name.toLowerCase().includes(searchQuery)
    );

    const allVideos = [...localVideoFiles, ...loadedVideos];
    const filteredVideos = allVideos.filter(vid => {
      const matchesSearch = vid.name.toLowerCase().includes(searchQuery);
      let matchesFilter = true;
      if (filterMode === '3d') matchesFilter = vid.mode_3d !== '2d';
      if (filterMode === '2d') matchesFilter = vid.mode_3d === '2d';
      return matchesSearch && matchesFilter;
    });

    const hasContent = (parentDirectory && !searchQuery) || filteredDirs.length > 0 || filteredVideos.length > 0;

    if (!hasContent) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    // 1. Render Parent Directory Card (if parent exists and not searching)
    if (parentDirectory && !searchQuery) {
      const parentCard = createParentFolderCard(parentDirectory);
      videoGrid.appendChild(parentCard);
    }

    // 2. Render Subfolder Cards
    filteredDirs.forEach(dir => {
      const folderCard = createFolderCard(dir);
      videoGrid.appendChild(folderCard);
    });

    // 3. Render Video Cards
    filteredVideos.forEach(vid => {
      const videoCard = createVideoCard(vid);
      videoGrid.appendChild(videoCard);
    });
  }

  function createParentFolderCard(parentPath) {
    const card = document.createElement('div');
    card.className = 'folder-card parent-folder-card';
    card.title = `Go up to parent directory: ${parentPath}`;
    card.innerHTML = `
      <div class="folder-icon-container">
        <span class="folder-emoji">⬆️</span>
      </div>
      <div class="folder-info">
        <div class="folder-title">.. (Parent Directory)</div>
        <span class="folder-badge">${parentPath}</span>
      </div>
    `;
    card.addEventListener('click', () => loadDirectory(parentPath));
    return card;
  }

  function createFolderCard(dir) {
    const card = document.createElement('div');
    card.className = 'folder-card';
    card.title = `Open subfolder: ${dir.path}`;
    card.innerHTML = `
      <div class="folder-icon-container">
        <span class="folder-emoji">📁</span>
      </div>
      <div class="folder-info">
        <div class="folder-title" title="${dir.name}">${dir.name}</div>
        <span class="folder-badge">Subfolder</span>
      </div>
    `;
    card.addEventListener('click', () => loadDirectory(dir.path));
    return card;
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
    playerTitle.title = video.name;
    webVideoElement.title = video.name;
    playerModeSelect.value = video.mode_3d;
    overlayModeSelect.value = video.mode_3d;
    updatePlayerBadge(video.mode_3d);

    const streamUrl = video.isLocal
      ? video.blobUrl
      : `/api/stream?path=${encodeURIComponent(video.path)}`;

    webVideoElement.src = streamUrl;
    playerModal.classList.add('active');
    showOverlayBar();
    webVideoElement.play().catch(e => console.log("Autoplay prevented:", e));
  }

  function closePlayerModal() {
    webVideoElement.pause();
    webVideoElement.src = '';
    playerModal.classList.remove('active');
    currentPlayingVideo = null;
    hideOverlayBar();
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

  function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const secs = Math.floor(seconds);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
