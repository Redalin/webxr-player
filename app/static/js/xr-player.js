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
    this.mode3D = '3d_sbs'; // '2d', '2d_passthrough', '3d_sbs', '3d_tb', '3d_180_sbs', '3d_360_sbs'
    this.isVRSupported = false;

    // Animated 2D Cinema Floor Effect State
    this.floorMesh = null;
    this.floorTexture = null;

    // In-VR 3D HUD Panel State
    this.hudMesh = null;
    this.hudCanvas = null;
    this.hudCtx = null;
    this.hudTexture = null;
    this.hudVisible = true;
    this.hudTimer = null;
    this.controllers = [];
    this.reticleDots = [];
    this.raycaster = new THREE.Raycaster();
    this.currentHoveredButton = null;

    // Dragging state
    this.isDragging = false;
    this.wasDragging = false;
    this.activeDragController = null;
    this.dragOffset = new THREE.Vector3();
    this.dragDistance = 1.5;

    // VR Joystick 5-second jog state
    this.lastJoystickJogTime = 0;
    this.joystickJogActive = false;

    // VR 3D Format Dropdown Menu state
    this.formatMenuOpen = false;
    this.isSwitchingMode = false;

    this.checkXRSupport();
  }

  async checkXRSupport() {
    if ('xr' in navigator) {
      try {
        const isVR = await navigator.xr.isSessionSupported('immersive-vr');
        const isAR = await navigator.xr.isSessionSupported('immersive-ar');
        this.isVRSupported = isVR || isAR;
      } catch (err) {
        console.warn("WebXR support check failed:", err);
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
      const isPassthrough = (projectionMode === '2d_passthrough');
      let sessionMode = 'immersive-vr';

      if (isPassthrough) {
        try {
          const isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
          if (isARSupported) {
            sessionMode = 'immersive-ar';
          }
        } catch (e) {}
      }

      const sessionInit = sessionMode === 'immersive-ar'
        ? { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }
        : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'passthrough'] };

      this.xrSession = await navigator.xr.requestSession(sessionMode, sessionInit);

      this.initThreeJS();
      await this.renderer.xr.setSession(this.xrSession);

      if (isPassthrough && 'requestPassthrough' in this.xrSession) {
        try {
          await this.xrSession.requestPassthrough();
        } catch (e) {}
      }

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
    if (this.isPassthroughMode(this.mode3D)) {
      this.scene.background = null;
    } else {
      this.scene.background = new THREE.Color(0x05050a);
    }

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.isPassthroughMode(this.mode3D)) {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(0x05050a, 1);
    }
    this.renderer.xr.enabled = true;

    const container = document.getElementById('xr-canvas-container');
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // Setup ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Setup VR Controllers, Laser Pointers, and Reticle Dots
    this.controllers = [];
    this.reticleDots = [];
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);

      controller.addEventListener('selectstart', (e) => this.onControllerSelectStart(controller));
      controller.addEventListener('selectend', (e) => this.onControllerSelectEnd(controller));
      controller.addEventListener('select', (e) => this.onVRControllerSelect(controller));

      // Laser pointer line
      const laserGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5)
      ]);
      const laserMat = new THREE.LineBasicMaterial({ color: 0x6366f1, opacity: 0.85, transparent: true });
      const laser = new THREE.Line(laserGeo, laserMat);
      laser.name = "laserBeam";
      controller.add(laser);

      // Reticle Dot (Small solid target dot at laser tip, slightly larger than laser line)
      const dotGeo = new THREE.CircleGeometry(0.005, 32);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xff0055,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true
      });
      const reticleDot = new THREE.Mesh(dotGeo, dotMat);
      reticleDot.name = "reticleDot";
      reticleDot.visible = false;
      reticleDot.renderOrder = 99999;
      this.scene.add(reticleDot);

      this.scene.add(controller);
      this.controllers.push(controller);
      this.reticleDots.push(reticleDot);
    }
  }

  // Controller Haptics Trigger (Vibration pulse)
  triggerHapticPulse(controller, intensity = 0.5, duration = 40) {
    if (!this.xrSession) return;
    try {
      const inputSources = Array.from(this.xrSession.inputSources || []);
      const index = this.controllers.indexOf(controller);
      const source = inputSources[index] || inputSources.find(s => s.targetRayMode === 'tracked-pointer');

      if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
        source.gamepad.hapticActuators[0].pulse(intensity, duration);
      }
    } catch (e) {
      // Haptics API not available on this platform
    }
  }

  isPassthroughMode(mode) {
    return mode === '2d_passthrough';
  }

  async setProjectionMode(newMode) {
    const oldMode = this.mode3D;
    const oldIsPassthrough = this.isPassthroughMode(oldMode);
    const newIsPassthrough = this.isPassthroughMode(newMode);

    this.mode3D = newMode;

    // If switching between VR mode (immersive-vr) and Passthrough mode (immersive-ar),
    // restart the WebXR session seamlessly so Meta Quest hardware compositor switches modes.
    if (this.xrSession && (oldIsPassthrough !== newIsPassthrough)) {
      const savedTime = this.videoElement ? this.videoElement.currentTime : 0;
      const wasPlaying = this.videoElement ? !this.videoElement.paused : false;

      this.isSwitchingMode = true;
      const currentSession = this.xrSession;
      this.xrSession = null;
      await currentSession.end();

      await this.startVRSession(this.videoElement, newMode);
      this.isSwitchingMode = false;

      if (this.videoElement) {
        this.videoElement.currentTime = savedTime;
        if (wasPlaying) {
          this.videoElement.play().catch(() => {});
        }
      }
      return;
    }

    if (this.scene) {
      if (newIsPassthrough) {
        this.scene.background = null;
        if (this.renderer) {
          this.renderer.setClearColor(0x000000, 0);
        }
      } else {
        this.scene.background = new THREE.Color(0x05050a);
        if (this.renderer) {
          this.renderer.setClearColor(0x05050a, 1);
        }
      }
    }

    if (this.xrSession && this.scene) {
      this.setupStereoVideoScene();
      this.updateVRHUDCanvas();
    }
  }

  setupFloorEffect() {
    if (this.floorMesh && this.scene) {
      this.scene.remove(this.floorMesh);
      if (this.floorMesh.geometry) this.floorMesh.geometry.dispose();
      if (this.floorMesh.material) this.floorMesh.material.dispose();
      this.floorMesh = null;
    }
    if (this.floorTexture) {
      this.floorTexture.dispose();
      this.floorTexture = null;
    }

    if (this.mode3D !== '2d') return;

    // Create a 512x512 procedural floor grid texture with soft radial glow & grid lines
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Radial gradient glow below the video screen
    const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 256);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    grad.addColorStop(0.5, 'rgba(30, 27, 75, 0.18)');
    grad.addColorStop(1, 'rgba(5, 5, 10, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grid lines for spatial floor depth perception
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.22)';
    ctx.lineWidth = 2;
    const step = 32;
    for (let x = 0; x <= 512; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    this.floorTexture = new THREE.CanvasTexture(canvas);
    this.floorTexture.wrapS = THREE.RepeatWrapping;
    this.floorTexture.wrapT = THREE.RepeatWrapping;
    this.floorTexture.repeat.set(4, 4);

    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshBasicMaterial({
      map: this.floorTexture,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(0, 0.01, -1.5);
    if (this.scene) this.scene.add(this.floorMesh);
  }

  setupStereoVideoScene() {
    if (!this.videoElement) return;

    // Create / update or clear animated floor effect based on 2D mode
    this.setupFloorEffect();

    if (!this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.format = THREE.RGBAFormat;
    }

    if (this.leftMesh) this.scene.remove(this.leftMesh);
    if (this.rightMesh) this.scene.remove(this.rightMesh);

    const mode = this.mode3D;
    const is2D = (mode === '2d' || mode === '2d_passthrough');

    if (is2D) {
      const geometry = new THREE.PlaneGeometry(4, 2.25);
      const texture = this.videoTexture.clone();
      texture.needsUpdate = true;

      // Check if original video source is SBS or TB format
      const videoTitle = (this.videoElement && this.videoElement.title) ? this.videoElement.title.toLowerCase() : '';
      const isSourceSBS = videoTitle.includes('sbs') || videoTitle.includes('3d');
      const isSourceTB = videoTitle.includes('tb') || videoTitle.includes('ou');

      if (isSourceSBS) {
        // Crop left eye half for clean single 2D flat viewing of 3D SBS video
        texture.offset.set(0, 0);
        texture.repeat.set(0.5, 1.0);
      } else if (isSourceTB) {
        // Crop top eye half for clean single 2D flat viewing of 3D TB video
        texture.offset.set(0, 0.5);
        texture.repeat.set(1.0, 0.5);
      } else {
        texture.offset.set(0, 0);
        texture.repeat.set(1.0, 1.0);
      }

      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      this.leftMesh = new THREE.Mesh(geometry, material);
      this.leftMesh.position.set(0, 1.6, -3);
      this.scene.add(this.leftMesh);
      return;
    }

    let geometryLeft, geometryRight;

    if (mode === '3d_180_sbs') {
      // 180° VR Hemisphere centered facing forward (-Z axis by default)
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, 0, Math.PI, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryLeft.rotateY(Math.PI);
      geometryRight = geometryLeft.clone();
    } else if (mode === '3d_360_sbs') {
      // 360° VR Sphere centered facing forward (-Z axis by default)
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, 0, Math.PI * 2, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryLeft.rotateY(Math.PI);
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
    this.hudCanvas.height = 380;
    this.hudCtx = this.hudCanvas.getContext('2d');

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;
    this.hudTexture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(1.6, 0.59375);
    const material = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.hudMesh = new THREE.Mesh(geometry, material);
    this.hudMesh.position.set(0, 0.85, -1.8);
    this.hudMesh.rotation.x = -0.15;
    this.hudMesh.renderOrder = 10;

    this.hudMesh.layers.enable(0);
    this.hudMesh.layers.enable(1);
    this.hudMesh.layers.enable(2);

    this.scene.add(this.hudMesh);
    this.updateVRHUDCanvas();
  }

  resetHUDTimer() {
    clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => {
      if (this.videoElement && !this.videoElement.paused && !this.isDragging) {
        this.hideVRHUD();
      }
    }, 6000);
  }

  showVRHUD() {
    this.hudVisible = true;
    if (this.hudMesh) this.hudMesh.visible = true;
    this.setLasersVisible(true);
    this.updateVRHUDCanvas();
    this.resetHUDTimer();
  }

  hideVRHUD() {
    this.hudVisible = false;
    this.isDragging = false;
    this.activeDragController = null;
    this.currentHoveredButton = null;
    if (this.hudMesh) this.hudMesh.visible = false;
    this.setLasersVisible(false);
    this.reticleDots.forEach(dot => { dot.visible = false; });
  }

  setLasersVisible(visible) {
    this.controllers.forEach(controller => {
      const laser = controller.getObjectByName("laserBeam");
      if (laser) laser.visible = visible;
    });
  }

  updateVRHUDCanvas() {
    if (!this.hudCtx || !this.hudCanvas) return;
    const ctx = this.hudCtx;
    const w = 1024;
    const h = 380;

    ctx.clearRect(0, 0, w, h);

    // Background Glassmorphism Panel (Draws for y: 15..240, height 225px)
    ctx.fillStyle = 'rgba(18, 19, 30, 0.94)';
    this.drawRoundedRect(ctx, 20, 15, w - 40, 225, 20, true, true, '#2e3046');

    // 1. DRAG BAR (Top Left Handle) [x: 60..580, y: 28..70]
    const isDragHover = (this.currentHoveredButton === 'drag_bar');
    ctx.fillStyle = this.isDragging ? '#4f46e5' : (isDragHover ? '#3730a3' : '#26283b');
    this.drawRoundedRect(ctx, 60, 28, 520, 42, 10, true, true, isDragHover ? '#818cf8' : '#3f4260');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    const videoTitle = (this.videoElement && this.videoElement.title) ? this.videoElement.title : 'DRAG PANEL TO MOVE';
    ctx.fillText(`≡ ${this.truncateString(videoTitle, 26)}`, 80, 56);

    // 2. CLOSE BUTTON [✖] (Top Right) [x: 914..964, y: 28..70]
    const isCloseHover = (this.currentHoveredButton === 'close_btn');
    ctx.fillStyle = isCloseHover ? '#ef4444' : '#dc2626';
    this.drawRoundedRect(ctx, 914, 28, 50, 42, 10, true, true, isCloseHover ? '#fca5a5' : '#ef4444');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✖', 939, 57);
    ctx.textAlign = 'left';

    // Interactive Current Mode Badge Button [x: 600..900, y: 28..70]
    const isModeHover = (this.currentHoveredButton === 'mode_badge');
    ctx.fillStyle = isModeHover ? '#7c3aed' : (this.formatMenuOpen ? '#8b5cf6' : '#6366f1');
    this.drawRoundedRect(ctx, 600, 28, 300, 42, 10, true, true, isModeHover ? '#ec4899' : (this.formatMenuOpen ? '#a78bfa' : '#818cf8'));
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.getModeTitle(this.mode3D)} ▾`, 750, 56);

    // 2. Video Progress Bar Track & Timer Row [y: 90..120]
    const currentTime = window.getCurrentTime ? window.getCurrentTime() : (this.videoElement ? this.videoElement.currentTime : 0);
    const duration = window.getTotalDuration ? window.getTotalDuration() : ((this.videoElement && this.videoElement.duration) ? this.videoElement.duration : 1);
    const progressPct = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

    // Elapsed Time (Left of Seek Bar)
    ctx.fillStyle = '#9ca3af';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(this.formatTime(currentTime), 60, 105);

    // Total Duration (Right of Seek Bar)
    ctx.textAlign = 'right';
    ctx.fillText(this.formatTime(duration), 964, 105);

    // Horizontally Shrunken Seek Bar Track [x: 155..865] (Width 710px)
    const isSeekHover = (this.currentHoveredButton === 'seek_bar');
    ctx.fillStyle = isSeekHover ? '#3f4260' : '#2e3046';
    this.drawRoundedRect(ctx, 155, 92, 710, 16, 8, true, isSeekHover, '#818cf8');

    // Filled Progress Bar
    if (progressPct > 0) {
      ctx.fillStyle = isSeekHover ? '#818cf8' : '#6366f1';
      this.drawRoundedRect(ctx, 155, 92, Math.max(16, 710 * progressPct), 16, 8, true, false);
    }

    // 3. Single Unified Controls Row [y: 160..195] (Height 35px - text fitted)
    // Left-Justified Group: Play/Pause, Rewind -30s, Fast-Forward +30s, Mute
    // 1) Play/Pause Button [x: 60..110]
    const isPaused = this.videoElement ? this.videoElement.paused : true;
    const isPlayHover = (this.currentHoveredButton === 'play_btn');
    ctx.fillStyle = isPlayHover ? '#4f46e5' : (isPaused ? '#6366f1' : '#3b82f6');
    this.drawRoundedRect(ctx, 60, 160, 50, 35, 8, true, isPlayHover, '#c7d2fe');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? '▶' : '⏸', 85, 183);

    // 2) Rewind -30s Button [x: 120..192]
    const isSkipBackHover = (this.currentHoveredButton === 'skip_back_btn');
    ctx.fillStyle = isSkipBackHover ? '#4b5563' : '#374151';
    this.drawRoundedRect(ctx, 120, 160, 72, 35, 8, true, isSkipBackHover, '#9ca3af');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⏪-30', 156, 183);

    // 3) Fast-Forward +30s Button [x: 202..274]
    const isSkipFwdHover = (this.currentHoveredButton === 'skip_forward_btn');
    ctx.fillStyle = isSkipFwdHover ? '#4b5563' : '#374151';
    this.drawRoundedRect(ctx, 202, 160, 72, 35, 8, true, isSkipFwdHover, '#9ca3af');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⏩+30', 238, 183);

    // 4) Mute Button (Icon-only) [x: 284..334]
    const isMuted = this.videoElement ? this.videoElement.muted : false;
    const isMuteHover = (this.currentHoveredButton === 'mute_btn');
    ctx.fillStyle = isMuteHover ? '#4b5563' : (isMuted ? '#ef4444' : '#374151');
    this.drawRoundedRect(ctx, 284, 160, 50, 35, 8, true, true, isMuteHover ? '#9ca3af' : '#4b5563');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isMuted ? '🔇' : '🔊', 309, 183);

    // Center-Justified Button: Re-Center [x: 442..582] (Center = 512)
    const isRecenterHover = (this.currentHoveredButton === 'recenter_btn');
    ctx.fillStyle = isRecenterHover ? '#10b981' : '#059669';
    this.drawRoundedRect(ctx, 442, 160, 140, 35, 8, true, true, isRecenterHover ? '#6ee7b7' : '#10b981');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 CENTER', 512, 183);

    // Right-Justified Button: Exit VR [x: 824..964] (Right margin = 964)
    const isExitVrHover = (this.currentHoveredButton === 'exit_vr_btn');
    ctx.fillStyle = isExitVrHover ? '#4b5563' : '#374151';
    this.drawRoundedRect(ctx, 824, 160, 140, 35, 8, true, true, isExitVrHover ? '#9ca3af' : '#4b5563');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚪 EXIT VR', 894, 183);

    // 4. Pop-up 3D Format Dropdown Menu List (When formatMenuOpen is true)
    if (this.formatMenuOpen) {
      // Floating glassmorphism menu card anchored to top-right mode badge
      ctx.fillStyle = 'rgba(14, 15, 26, 0.98)';
      this.drawRoundedRect(ctx, 600, 72, 300, 296, 16, true, true, '#6366f1');

      ctx.fillStyle = '#9ca3af';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SELECT 3D FORMAT', 750, 92);

      const options = [
        { id: 'fmt_2d', mode: '2d', label: '2D Flat Screen' },
        { id: 'fmt_2d_passthrough', mode: '2d_passthrough', label: '2D Flat Passthrough' },
        { id: 'fmt_3d_sbs', mode: '3d_sbs', label: '3D Side-by-Side (SBS)' },
        { id: 'fmt_3d_tb', mode: '3d_tb', label: '3D Top-Bottom (TB)' },
        { id: 'fmt_3d_180_sbs', mode: '3d_180_sbs', label: '3D 180° VR Hemisphere' },
        { id: 'fmt_3d_360_sbs', mode: '3d_360_sbs', label: '3D 360° VR Sphere' }
      ];

      options.forEach((opt, idx) => {
        const itemY = 100 + idx * 42;
        const isSelected = (this.mode3D === opt.mode);
        const isHovered = (this.currentHoveredButton === opt.id);

        ctx.fillStyle = isHovered ? '#7c3aed' : (isSelected ? '#6366f1' : '#26283b');
        this.drawRoundedRect(ctx, 610, itemY, 280, 36, 8, true, true, isHovered ? '#ec4899' : (isSelected ? '#818cf8' : '#3f4260'));

        ctx.fillStyle = '#ffffff';
        ctx.font = isSelected ? 'bold 13px sans-serif' : '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(isSelected ? `✓  ${opt.label}` : opt.label, 625, itemY + 23);
      });
    }

    ctx.textAlign = 'left';
    if (this.hudTexture) this.hudTexture.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Per-Frame Raycasting, Reticle Dot Positioning & Haptics Feedback
  // ------------------------------------------------------------------
  updateRaycastingAndHover() {
    if (!this.hudVisible || !this.hudMesh || !this.scene) {
      this.reticleDots.forEach(dot => { dot.visible = false; });
      this.setLasersVisible(false);
      return;
    }

    this.setLasersVisible(true);
    let newHoveredBtn = null;
    let hoveringController = null;

    for (let i = 0; i < this.controllers.length; i++) {
      const controller = this.controllers[i];
      const reticleDot = this.reticleDots[i];
      const laser = controller.getObjectByName("laserBeam");

      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);

      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = this.raycaster.intersectObject(this.hudMesh);

      if (intersects.length > 0) {
        const hit = intersects[0];

        // 1. Position Reticle Dot slightly in front of the 3D surface intersection point toward the camera
        const dirToCam = this.camera
          ? new THREE.Vector3().subVectors(this.camera.position, hit.point).normalize()
          : new THREE.Vector3(0, 0, 1);
        reticleDot.position.copy(hit.point).addScaledVector(dirToCam, 0.015);
        if (this.camera) {
          reticleDot.lookAt(this.camera.position);
        }
        reticleDot.visible = true;

        // 2. Trim laser line so it ends precisely at the Reticle Dot on the button
        if (laser) {
          const dist = hit.distance;
          laser.scale.set(1, 1, dist / 5.0);
        }

        // 3. Map UV to HUD Canvas button ID
        const uv = hit.uv;
        const x = uv.x * 1024;
        const y = (1 - uv.y) * 380;
        const btnId = this.getButtonIdAt(x, y);

        if (btnId) {
          newHoveredBtn = btnId;
          hoveringController = controller;
        }
      } else {
        reticleDot.visible = false;
        if (laser) laser.scale.set(1, 1, 1.0);
      }
    }

    // Trigger short vibration pulse & reset auto-hide timer when laser enters or hovers over a button
    if (newHoveredBtn && newHoveredBtn !== this.currentHoveredButton) {
      this.currentHoveredButton = newHoveredBtn;
      if (hoveringController) {
        this.triggerHapticPulse(hoveringController, 0.45, 30);
      }
      this.updateVRHUDCanvas();
      this.resetHUDTimer();
    } else if (newHoveredBtn) {
      // Refresh auto-hide timer while laser is hovering over any button
      this.resetHUDTimer();
    } else if (!newHoveredBtn && this.currentHoveredButton) {
      this.currentHoveredButton = null;
      this.updateVRHUDCanvas();
    }
  }

  getButtonIdAt(x, y) {
    if (x >= 914 && x <= 964 && y >= 28 && y <= 70) return 'close_btn';
    if (x >= 60 && x <= 580 && y >= 28 && y <= 70) return 'drag_bar';
    if (x >= 600 && x <= 900 && y >= 28 && y <= 70) return 'mode_badge';

    // Format Dropdown Options (when formatMenuOpen is true)
    if (this.formatMenuOpen) {
      if (x >= 600 && x <= 900) {
        if (y >= 100 && y <= 138) return 'fmt_2d';
        if (y >= 142 && y <= 180) return 'fmt_2d_passthrough';
        if (y >= 184 && y <= 222) return 'fmt_3d_sbs';
        if (y >= 226 && y <= 264) return 'fmt_3d_tb';
        if (y >= 268 && y <= 306) return 'fmt_3d_180_sbs';
        if (y >= 310 && y <= 348) return 'fmt_3d_360_sbs';
      }
    }

    // Shrunken Seek Bar Hitbox [x: 155..865, y: 85..115]
    if (x >= 155 && x <= 865 && y >= 85 && y <= 115) return 'seek_bar';

    // Single Unified Controls Row [y: 160..195] (Height 35px)
    if (y >= 160 && y <= 195) {
      if (x >= 60 && x <= 110) return 'play_btn';
      if (x >= 120 && x <= 192) return 'skip_back_btn';
      if (x >= 202 && x <= 274) return 'skip_forward_btn';
      if (x >= 284 && x <= 334) return 'mute_btn';
      if (x >= 442 && x <= 582) return 'recenter_btn';
      if (x >= 824 && x <= 964) return 'exit_vr_btn';
    }

    return null;
  }

  // Handle Controller Select Start (Begins dragging if hitting Drag Bar)
  onControllerSelectStart(controller) {
    if (!this.hudMesh || !this.scene || !this.hudVisible) return;

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = this.raycaster.intersectObject(this.hudMesh);

    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      const x = uv.x * 1024;
      const y = (1 - uv.y) * 380;

      // Check if click was on Drag Bar [x: 60..580, y: 28..70]
      if (x >= 60 && x <= 580 && y >= 28 && y <= 70) {
        this.isDragging = true;
        this.wasDragging = true;
        this.activeDragController = controller;

        // Store exact 3D drag intersection point & offset from HUD position so panel doesn't jump
        const hitPoint = intersects[0].point;
        this.dragDistance = intersects[0].distance;
        this.dragOffset = new THREE.Vector3().subVectors(this.hudMesh.position, hitPoint);

        this.triggerHapticPulse(controller, 0.6, 40);
      }
    }
  }

  onControllerSelectEnd(controller) {
    if (this.activeDragController === controller) {
      this.isDragging = false;
      this.activeDragController = null;
      this.updateVRHUDCanvas();
    }
  }

  onVRControllerSelect(controller) {
    if (this.wasDragging) {
      this.wasDragging = false;
      return;
    }

    if (!this.hudMesh || !this.scene) return;

    if (!this.hudVisible) {
      this.showVRHUD();
      return;
    }

    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = this.raycaster.intersectObject(this.hudMesh);

    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      const x = uv.x * 1024;
      const y = (1 - uv.y) * 380; // Flip Y for canvas space

      // Trigger strong haptic pulse on click
      this.triggerHapticPulse(controller, 0.85, 60);

      const btnId = this.getButtonIdAt(x, y);

      if (btnId === 'close_btn') {
        this.hideVRHUD();
        return;
      } else if (btnId === 'drag_bar') {
        return;
      } else if (btnId === 'mode_badge') {
        this.formatMenuOpen = !this.formatMenuOpen;
        this.updateVRHUDCanvas();
        return;
      } else if (btnId && btnId.startsWith('fmt_')) {
        const mode = btnId.replace('fmt_', '');
        this.setProjectionMode(mode);
        this.formatMenuOpen = false;
        this.updateVRHUDCanvas();
        return;
      } else if (btnId === 'play_btn') {
        if (this.videoElement) {
          if (this.videoElement.paused) this.videoElement.play();
          else this.videoElement.pause();
        }
      } else if (btnId === 'skip_back_btn') {
        if (window.seekToTime && window.getCurrentTime) {
          window.seekToTime(window.getCurrentTime() - 30);
        }
      } else if (btnId === 'skip_forward_btn') {
        if (window.seekToTime && window.getCurrentTime) {
          window.seekToTime(window.getCurrentTime() + 30);
        }
      } else if (btnId === 'seek_bar') {
        const total = window.getTotalDuration ? window.getTotalDuration() : (this.videoElement ? this.videoElement.duration : 0);
        if (total > 0) {
          const pct = Math.min(1, Math.max(0, (x - 155) / 710));
          const targetTime = pct * total;
          if (window.seekToTime) {
            window.seekToTime(targetTime);
          } else if (this.videoElement) {
            this.videoElement.currentTime = targetTime;
          }
        }
      } else if (btnId === 'mute_btn') {
        if (this.videoElement) this.videoElement.muted = !this.videoElement.muted;
      } else if (btnId === 'recenter_btn') {
        this.recenterVRView();
      } else if (btnId === 'exit_vr_btn') {
        this.exitVR();
      } else {
        if (this.formatMenuOpen) {
          this.formatMenuOpen = false;
          this.updateVRHUDCanvas();
        }
      }

      this.showVRHUD();
    } else {
      // Clicked away from control panel into 3D VR space -> hide control panel
      this.hideVRHUD();
    }
  }

  // ------------------------------------------------------------------
  // Re-Center VR View Functionality
  // ------------------------------------------------------------------
  recenterVRView() {
    if (!this.camera) return;

    // Get Head position and direction
    const headPos = new THREE.Vector3();
    const headDir = new THREE.Vector3();

    this.camera.getWorldPosition(headPos);
    this.camera.getWorldDirection(headDir);

    // Flatten headDir to horizontal plane (y = 0)
    headDir.y = 0;
    headDir.normalize();

    if (this.mode3D === '3d_180_sbs' || this.mode3D === '3d_360_sbs') {
      // 180° / 360° VR Mode: Position sphere centered around head and rotate Y to match gaze
      const yawAngle = Math.atan2(headDir.x, headDir.z) + Math.PI;
      if (this.leftMesh) {
        this.leftMesh.position.copy(headPos);
        this.leftMesh.rotation.set(0, yawAngle, 0);
      }
      if (this.rightMesh) {
        this.rightMesh.position.copy(headPos);
        this.rightMesh.rotation.set(0, yawAngle, 0);
      }
    } else {
      // 2D / 3D Flat Cinema Mode: Position video screen 3 meters ahead at eye level
      const videoPos = headPos.clone().add(headDir.clone().multiplyScalar(3.0));
      videoPos.y = headPos.y;

      if (this.leftMesh) {
        this.leftMesh.position.copy(videoPos);
        this.leftMesh.lookAt(headPos.x, videoPos.y, headPos.z);
      }
      if (this.rightMesh) {
        this.rightMesh.position.copy(videoPos);
        this.rightMesh.lookAt(headPos.x, videoPos.y, headPos.z);
      }
    }

    // 2. Position HUD panel 1.8 meters ahead slightly below eye level
    const hudPos = headPos.clone().add(headDir.clone().multiplyScalar(1.8));
    hudPos.y = headPos.y - 0.45;

    if (this.hudMesh) {
      this.hudMesh.position.copy(hudPos);
      this.hudMesh.lookAt(headPos.x, hudPos.y + 0.3, headPos.z);
    }
  }

  updateJoystickJog(frame) {
    if (!frame) return;
    const session = frame.session;
    if (!session || !session.inputSources) return;

    let maxMagnitude = 0;
    let targetAxisX = 0;
    let activeSource = null;

    const sources = Array.from(session.inputSources);
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      if (source && source.gamepad && source.gamepad.axes) {
        const axes = source.gamepad.axes;
        // Thumbstick X-axis (index 2 on standard WebXR gamepad, fallback to 0)
        let axisX = 0;
        if (axes.length >= 4) {
          axisX = axes[2];
        } else if (axes.length > 0) {
          axisX = axes[0];
        }

        if (Math.abs(axisX) > maxMagnitude) {
          maxMagnitude = Math.abs(axisX);
          targetAxisX = axisX;
          activeSource = source;
        }
      }
    }

    const now = performance.now();
    const deadzone = 0.25;
    const threshold = 0.55;

    // Reset lock when joystick returns to center
    if (maxMagnitude < deadzone) {
      this.joystickJogActive = false;
      return;
    }

    // Trigger 5-second jog step when thumbstick is flicked/tilted left or right
    if (!this.joystickJogActive || (now - this.lastJoystickJogTime > 250)) {
      if (targetAxisX < -threshold) {
        // Jog Backward 5 seconds
        this.joystickJogActive = true;
        this.lastJoystickJogTime = now;

        if (window.seekToTime && window.getCurrentTime) {
          const current = window.getCurrentTime();
          window.seekToTime(current - 5);
        }

        // Haptic vibration feedback pulse on joystick jog
        const controllerObj = this.controllers[sources.indexOf(activeSource)] || this.controllers[0];
        if (controllerObj) {
          this.triggerHapticPulse(controllerObj, 0.5, 40);
        }
      } else if (targetAxisX > threshold) {
        // Jog Forward 5 seconds
        this.joystickJogActive = true;
        this.lastJoystickJogTime = now;

        if (window.seekToTime && window.getCurrentTime) {
          const current = window.getCurrentTime();
          window.seekToTime(current + 5);
        }

        // Haptic vibration feedback pulse on joystick jog
        const controllerObj = this.controllers[sources.indexOf(activeSource)] || this.controllers[0];
        if (controllerObj) {
          this.triggerHapticPulse(controllerObj, 0.5, 40);
        }
      }
    }
  }

  renderVR(time, frame) {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }

    // Maintain stationary floor grid plane in 2D Flat Screen mode (without passthrough)
    if (this.mode3D === '2d' && this.floorMesh) {
      if (this.floorMesh.material) {
        this.floorMesh.material.opacity = 0.55;
      }
    }

    // Process VR controller joystick / thumbstick X-axis jog (±5 seconds per move)
    this.updateJoystickJog(frame);

    // Update laser line trimming, reticle dot position, and haptics hover
    this.updateRaycastingAndHover();

    // Continuously update VR HUD Canvas while HUD is visible & video playing so progress bar & timer advance smoothly
    if (this.hudVisible && this.videoElement && !this.videoElement.paused) {
      this.updateVRHUDCanvas();
    }

    // Handle smooth dragging of HUD panel with active VR controller
    if (this.isDragging && this.activeDragController && this.hudMesh) {
      const controllerPos = new THREE.Vector3();
      const controllerDir = new THREE.Vector3();
      const tempMatrix = new THREE.Matrix4();

      this.activeDragController.getWorldPosition(controllerPos);
      tempMatrix.identity().extractRotation(this.activeDragController.matrixWorld);
      controllerDir.set(0, 0, -1).applyMatrix4(tempMatrix);

      const dist = this.dragDistance || 1.5;
      const rayPoint = controllerPos.clone().add(controllerDir.clone().multiplyScalar(dist));
      const targetHudPos = rayPoint.add(this.dragOffset || new THREE.Vector3());
      this.hudMesh.position.copy(targetHudPos);

      // Rotate HUD panel to face user camera
      if (this.camera) {
        const camPos = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.hudMesh.lookAt(camPos.x, targetHudPos.y, camPos.z);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onVRSessionEnd() {
    if (this.isSwitchingMode) return;

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }
    const container = document.getElementById('xr-canvas-container');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    // Pause video playback on VR exit so the user returns to 2D web view paused at current position
    if (this.videoElement) {
      this.videoElement.pause();
    }
    if (this.floorMesh && this.scene) {
      this.scene.remove(this.floorMesh);
    }
    this.floorMesh = null;
    this.floorTexture = null;
    this.xrSession = null;
    this.hudMesh = null;
    this.isDragging = false;
    this.currentHoveredButton = null;
    this.reticleDots.forEach(dot => { dot.visible = false; });
  }

  exitVR() {
    if (this.videoElement) {
      this.videoElement.pause();
    }
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
      case '2d_passthrough': return '2D Passthrough';
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

  truncateString(str, maxLen = 30) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
  }
}

// Global Singleton for WebXR Player
window.xrPlayer = new XRVideoPlayer();
