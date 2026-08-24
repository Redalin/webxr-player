class XRVideoPlayer {
  constructor() {
    this.xrSession = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.videoElement = null;
    this.videoTexture = null;
    this.leftMesh = null;
    this.rightMesh = null;
    this.mode3D = '3d_sbs'; // '2d', '3d_sbs', '3d_tb', '3d_180_sbs', '3d_360_sbs'
    this.isVRSupported = false;

    // In-VR 3D HUD Panel State
    this.hudMesh = null;
    this.hudCanvas = null;
    this.hudCtx = null;
    this.hudTexture = null;
    this.hudVisible = true;
    this.hudTimer = null;
    this.controllers = [];
    this.raycaster = new THREE.Raycaster();

    this.checkXRSupport();
  }

  async checkXRSupport() {
    if ('xr' in navigator) {
      try {
        this.isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
      } catch (err) {
        console.warn("WebXR immersive-vr check failed:", err);
        this.isVRSupported = false;
      }
    }
  }

  async startVRSession(videoEl, projectionMode = '3d_sbs') {
    if (!('xr' in navigator)) {
      alert("WebXR is not supported by your browser or device.");
      return;
    }

    this.videoElement = videoEl;
    this.mode3D = projectionMode;

    try {
      this.xrSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });

      this.initThreeJS();
      await this.renderer.xr.setSession(this.xrSession);

      this.xrSession.addEventListener('end', () => {
        this.onVRSessionEnd();
      });

      // Show XR Canvas container
      const container = document.getElementById('xr-canvas-container');
      if (container) container.style.display = 'block';

      this.setupStereoVideoScene();
      this.setupVRHUDPanel();

      this.renderer.setAnimationLoop((time, frame) => this.renderVR(time, frame));
      this.showVRHUD();

    } catch (err) {
      console.error("Failed to start WebXR session:", err);
      alert("Could not start WebXR session: " + err.message);
    }
  }

  initThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05050a);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    const container = document.getElementById('xr-canvas-container');
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // Setup ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Setup VR Controllers & Laser Pointers
    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('select', (e) => this.onVRControllerSelect(controller));

      // Laser pointer line
      const laserGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5)
      ]);
      const laserMat = new THREE.LineBasicMaterial({ color: 0x6366f1, opacity: 0.75, transparent: true });
      const laser = new THREE.Line(laserGeo, laserMat);
      controller.add(laser);

      this.scene.add(controller);
      this.controllers.push(controller);
    }
  }

  setProjectionMode(newMode) {
    this.mode3D = newMode;
    if (this.xrSession && this.scene) {
      this.setupStereoVideoScene();
      this.updateVRHUDCanvas();
    }
  }

  setupStereoVideoScene() {
    if (!this.videoElement) return;

    if (!this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.format = THREE.RGBAFormat;
    }

    if (this.leftMesh) this.scene.remove(this.leftMesh);
    if (this.rightMesh) this.scene.remove(this.rightMesh);

    const mode = this.mode3D;

    if (mode === '2d') {
      const geometry = new THREE.PlaneGeometry(4, 2.25);
      const material = new THREE.MeshBasicMaterial({ map: this.videoTexture, side: THREE.DoubleSide });
      this.leftMesh = new THREE.Mesh(geometry, material);
      this.leftMesh.position.set(0, 1.6, -3);
      this.scene.add(this.leftMesh);
      return;
    }

    let geometryLeft, geometryRight;

    if (mode === '3d_180_sbs') {
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, Math.PI / 2, Math.PI, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryRight = geometryLeft.clone();
    } else if (mode === '3d_360_sbs') {
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, 0, Math.PI * 2, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryRight = geometryLeft.clone();
    } else {
      geometryLeft = new THREE.PlaneGeometry(4, 2.25, 32, 16);
      geometryRight = new THREE.PlaneGeometry(4, 2.25, 32, 16);
    }

    const textureLeft = this.videoTexture.clone();
    const textureRight = this.videoTexture.clone();
    textureLeft.needsUpdate = true;
    textureRight.needsUpdate = true;

    if (mode === '3d_sbs' || mode === '3d_180_sbs' || mode === '3d_360_sbs') {
      textureLeft.offset.set(0, 0);
      textureLeft.repeat.set(0.5, 1.0);
      textureRight.offset.set(0.5, 0);
      textureRight.repeat.set(0.5, 1.0);
    } else if (mode === '3d_tb') {
      textureLeft.offset.set(0, 0.5);
      textureLeft.repeat.set(1.0, 0.5);
      textureRight.offset.set(0, 0);
      textureRight.repeat.set(1.0, 0.5);
    }

    const matLeft = new THREE.MeshBasicMaterial({ map: textureLeft, side: THREE.DoubleSide });
    const matRight = new THREE.MeshBasicMaterial({ map: textureRight, side: THREE.DoubleSide });

    this.leftMesh = new THREE.Mesh(geometryLeft, matLeft);
    this.rightMesh = new THREE.Mesh(geometryRight, matRight);

    if (mode !== '3d_180_sbs' && mode !== '3d_360_sbs') {
      this.leftMesh.position.set(0, 1.6, -3);
      this.rightMesh.position.set(0, 1.6, -3);
    } else {
      this.leftMesh.position.set(0, 1.6, 0);
      this.rightMesh.position.set(0, 1.6, 0);
    }

    this.leftMesh.layers.set(1);
    this.rightMesh.layers.set(2);

    this.scene.add(this.leftMesh);
    this.scene.add(this.rightMesh);
  }

  // ------------------------------------------------------------------
  // In-VR 3D Interactive Control HUD Panel Setup & Rendering
  // ------------------------------------------------------------------
  setupVRHUDPanel() {
    if (this.hudMesh) this.scene.remove(this.hudMesh);

    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 512;
    this.hudCtx = this.hudCanvas.getContext('2d');

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;
    this.hudTexture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(1.6, 0.8);
    const material = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.hudMesh = new THREE.Mesh(geometry, material);
    this.hudMesh.position.set(0, 0.85, -1.8);
    this.hudMesh.rotation.x = -0.15;

    // Make HUD visible to both eyes (Layer 0, 1, 2)
    this.hudMesh.layers.enable(0);
    this.hudMesh.layers.enable(1);
    this.hudMesh.layers.enable(2);

    this.scene.add(this.hudMesh);
    this.updateVRHUDCanvas();
  }

  showVRHUD() {
    this.hudVisible = true;
    if (this.hudMesh) this.hudMesh.visible = true;
    this.updateVRHUDCanvas();

    clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => {
      if (this.videoElement && !this.videoElement.paused) {
        this.hideVRHUD();
      }
    }, 5000);
  }

  hideVRHUD() {
    this.hudVisible = false;
    if (this.hudMesh) this.hudMesh.visible = false;
  }

  updateVRHUDCanvas() {
    if (!this.hudCtx || !this.hudCanvas) return;
    const ctx = this.hudCtx;
    const w = 1024;
    const h = 512;

    ctx.clearRect(0, 0, w, h);

    // Background Glassmorphism Panel
    ctx.fillStyle = 'rgba(18, 19, 30, 0.92)';
    this.drawRoundedRect(ctx, 20, 20, w - 40, h - 40, 24, true, true, '#2e3046');

    // Title / Status
    ctx.fillStyle = '#f3f4f6';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText('WebXR 3D Media Controls', 60, 75);

    // Current Mode Badge
    ctx.fillStyle = '#6366f1';
    this.drawRoundedRect(ctx, w - 240, 45, 180, 42, 10, true, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.getModeTitle(this.mode3D), w - 150, 73);
    ctx.textAlign = 'left';

    // Video Progress Bar Track
    const currentTime = this.videoElement ? this.videoElement.currentTime : 0;
    const duration = (this.videoElement && this.videoElement.duration) ? this.videoElement.duration : 1;
    const progressPct = Math.min(1, currentTime / duration);

    ctx.fillStyle = '#2e3046';
    this.drawRoundedRect(ctx, 60, 160, 904, 20, 10, true, false);

    // Filled Progress Bar
    if (progressPct > 0) {
      ctx.fillStyle = '#6366f1';
      this.drawRoundedRect(ctx, 60, 160, Math.max(20, 904 * progressPct), 20, 10, true, false);
    }

    // Time Display
    ctx.fillStyle = '#9ca3af';
    ctx.font = '22px monospace';
    ctx.fillText(`${this.formatTime(currentTime)} / ${this.formatTime(duration)}`, 60, 220);

    // 1. Play/Pause Button [x: 60..240, y: 260..350]
    const isPaused = this.videoElement ? this.videoElement.paused : true;
    ctx.fillStyle = isPaused ? '#6366f1' : '#3b82f6';
    this.drawRoundedRect(ctx, 60, 260, 180, 90, 16, true, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? '▶ PLAY' : '⏸ PAUSE', 150, 314);

    // 2. 3D Format Buttons
    const modes = [
      { id: '2d', label: '2D Flat', x: 260 },
      { id: '3d_sbs', label: '3D SBS', x: 400 },
      { id: '3d_tb', label: '3D TB', x: 540 },
      { id: '3d_180_sbs', label: '180° VR', x: 680 },
      { id: '3d_360_sbs', label: '360° VR', x: 820 }
    ];

    modes.forEach(m => {
      const isSelected = (this.mode3D === m.id);
      ctx.fillStyle = isSelected ? '#8b5cf6' : '#26283b';
      this.drawRoundedRect(ctx, m.x, 260, 120, 90, 14, true, true, isSelected ? '#a78bfa' : '#3f4260');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(m.label, m.x + 60, 314);
    });

    // 3. Action Buttons: Exit VR & Exit Video [y: 380..460]
    // Exit VR Button [x: 60..480]
    ctx.fillStyle = '#374151';
    this.drawRoundedRect(ctx, 60, 380, 430, 80, 14, true, true, '#4b5563');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('🚪 EXIT VR MODE', 275, 428);

    // Exit Video Button [x: 530..964]
    ctx.fillStyle = '#dc2626';
    this.drawRoundedRect(ctx, 530, 380, 434, 80, 14, true, true, '#ef4444');
    ctx.fillStyle = '#ffffff';
    ctx.fillText('✖ CLOSE VIDEO', 747, 428);

    ctx.textAlign = 'left';
    if (this.hudTexture) this.hudTexture.needsUpdate = true;
  }

  onVRControllerSelect(controller) {
    if (!this.hudMesh || !this.scene) return;

    if (!this.hudVisible) {
      this.showVRHUD();
      return;
    }

    // Perform Raycasting against In-VR 3D HUD Mesh
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = this.raycaster.intersectObject(this.hudMesh);

    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      const x = uv.x * 1024;
      const y = (1 - uv.y) * 512; // Flip Y for canvas space

      // 1. Play / Pause Button Click (x: 60..240, y: 260..350)
      if (x >= 60 && x <= 240 && y >= 260 && y <= 350) {
        if (this.videoElement) {
          if (this.videoElement.paused) this.videoElement.play();
          else this.videoElement.pause();
        }
      }
      // 2. Progress / Seek Line Click (x: 60..964, y: 140..230)
      else if (x >= 60 && x <= 964 && y >= 140 && y <= 230) {
        if (this.videoElement && this.videoElement.duration) {
          const pct = (x - 60) / 904;
          this.videoElement.currentTime = pct * this.videoElement.duration;
        }
      }
      // 3. 3D Mode Format Selection Buttons (y: 260..350)
      else if (y >= 260 && y <= 350) {
        if (x >= 260 && x <= 380) this.setProjectionMode('2d');
        else if (x >= 400 && x <= 520) this.setProjectionMode('3d_sbs');
        else if (x >= 540 && x <= 660) this.setProjectionMode('3d_tb');
        else if (x >= 680 && x <= 800) this.setProjectionMode('3d_180_sbs');
        else if (x >= 820 && x <= 940) this.setProjectionMode('3d_360_sbs');
      }
      // 4. Exit VR Mode (x: 60..480, y: 380..460)
      else if (x >= 60 && x <= 480 && y >= 380 && y <= 460) {
        this.exitVR();
      }
      // 5. Close Video (x: 530..964, y: 380..460)
      else if (x >= 530 && x <= 964 && y >= 380 && y <= 460) {
        if (this.videoElement) this.videoElement.pause();
        this.exitVR();
        const closeBtn = document.getElementById('btn-close-player');
        if (closeBtn) closeBtn.click();
      }

      this.showVRHUD();
    } else {
      // Tapped outside HUD -> toggle HUD visibility
      this.showVRHUD();
    }
  }

  renderVR(time, frame) {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }
    if (this.hudVisible && this.hudTexture) {
      this.updateVRHUDCanvas();
    }
    this.renderer.render(this.scene, this.camera);
  }

  onVRSessionEnd() {
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }
    const container = document.getElementById('xr-canvas-container');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    this.xrSession = null;
    this.hudMesh = null;
  }

  exitVR() {
    if (this.xrSession) {
      this.xrSession.end();
    }
  }

  // Canvas Helper Utilities
  drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = false, strokeColor = '#3f4260') {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  getModeTitle(mode) {
    switch (mode) {
      case '3d_sbs': return '3D SBS';
      case '3d_tb': return '3D Top-Bottom';
      case '3d_180_sbs': return '180° VR';
      case '3d_360_sbs': return '360° VR';
      default: return '2D Flat';
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const secs = Math.floor(seconds);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

// Global Singleton for WebXR Player
window.xrPlayer = new XRVideoPlayer();
