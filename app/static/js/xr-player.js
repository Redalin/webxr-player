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
    this.reticleDots = [];
    this.raycaster = new THREE.Raycaster();
    this.currentHoveredButton = null;

    // Dragging state
    this.isDragging = false;
    this.activeDragController = null;

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

      // Reticle Dot (Target dot at laser intersection point)
      const dotGeo = new THREE.RingGeometry(0.012, 0.026, 32);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xec4899, side: THREE.DoubleSide, depthTest: false });
      const reticleDot = new THREE.Mesh(dotGeo, dotMat);
      reticleDot.name = "reticleDot";
      reticleDot.visible = false;
      reticleDot.renderOrder = 999;
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

    this.hudMesh.layers.enable(0);
    this.hudMesh.layers.enable(1);
    this.hudMesh.layers.enable(2);

    this.scene.add(this.hudMesh);
    this.updateVRHUDCanvas();
  }

  showVRHUD() {
    this.hudVisible = true;
    if (this.hudMesh) this.hudMesh.visible = true;
    this.setLasersVisible(true);
    this.updateVRHUDCanvas();

    clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => {
      if (this.videoElement && !this.videoElement.paused && !this.isDragging) {
        this.hideVRHUD();
      }
    }, 6000);
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
    const h = 512;

    ctx.clearRect(0, 0, w, h);

    // Background Glassmorphism Panel
    ctx.fillStyle = 'rgba(18, 19, 30, 0.94)';
    this.drawRoundedRect(ctx, 20, 20, w - 40, h - 40, 24, true, true, '#2e3046');

    // 1. DRAG BAR (Top Left Handle) [x: 60..600, y: 35..77]
    const isDragHover = (this.currentHoveredButton === 'drag_bar');
    ctx.fillStyle = this.isDragging ? '#4f46e5' : (isDragHover ? '#3730a3' : '#26283b');
    this.drawRoundedRect(ctx, 60, 35, 540, 42, 10, true, true, isDragHover ? '#818cf8' : '#3f4260');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText('≡ DRAG PANEL TO MOVE', 80, 63);

    // 2. CLOSE BUTTON [✖] (Top Right) [x: 934..994, y: 35..77]
    const isCloseHover = (this.currentHoveredButton === 'close_btn');
    ctx.fillStyle = isCloseHover ? '#ef4444' : '#dc2626';
    this.drawRoundedRect(ctx, 934, 35, 60, 42, 10, true, true, isCloseHover ? '#fca5a5' : '#ef4444');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✖', 964, 65);
    ctx.textAlign = 'left';

    // Current Mode Badge [x: 620..920]
    ctx.fillStyle = '#6366f1';
    this.drawRoundedRect(ctx, 620, 35, 300, 42, 10, true, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.getModeTitle(this.mode3D), 770, 63);
    ctx.textAlign = 'left';

    // Video Progress Bar Track
    const currentTime = this.videoElement ? this.videoElement.currentTime : 0;
    const duration = (this.videoElement && this.videoElement.duration) ? this.videoElement.duration : 1;
    const progressPct = Math.min(1, currentTime / duration);

    const isSeekHover = (this.currentHoveredButton === 'seek_bar');
    ctx.fillStyle = isSeekHover ? '#3f4260' : '#2e3046';
    this.drawRoundedRect(ctx, 60, 160, 904, 20, 10, true, isSeekHover, '#818cf8');

    // Filled Progress Bar
    if (progressPct > 0) {
      ctx.fillStyle = isSeekHover ? '#818cf8' : '#6366f1';
      this.drawRoundedRect(ctx, 60, 160, Math.max(20, 904 * progressPct), 20, 10, true, false);
    }

    // Time Display
    ctx.fillStyle = '#9ca3af';
    ctx.font = '22px monospace';
    ctx.fillText(`${this.formatTime(currentTime)} / ${this.formatTime(duration)}`, 60, 220);

    // 3. Play/Pause Button [x: 60..240, y: 260..350]
    const isPaused = this.videoElement ? this.videoElement.paused : true;
    const isPlayHover = (this.currentHoveredButton === 'play_btn');
    ctx.fillStyle = isPlayHover ? '#4f46e5' : (isPaused ? '#6366f1' : '#3b82f6');
    this.drawRoundedRect(ctx, 60, 260, 180, 90, 16, true, isPlayHover, '#c7d2fe');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? '▶ PLAY' : '⏸ PAUSE', 150, 314);

    // 4. 3D Format Buttons
    const modes = [
      { id: '2d', label: '2D Flat', x: 260 },
      { id: '3d_sbs', label: '3D SBS', x: 400 },
      { id: '3d_tb', label: '3D TB', x: 540 },
      { id: '3d_180_sbs', label: '180° VR', x: 680 },
      { id: '3d_360_sbs', label: '360° VR', x: 820 }
    ];

    modes.forEach(m => {
      const isSelected = (this.mode3D === m.id);
      const isHovered = (this.currentHoveredButton === m.id);
      ctx.fillStyle = isHovered ? '#7c3aed' : (isSelected ? '#8b5cf6' : '#26283b');
      this.drawRoundedRect(ctx, m.x, 260, 120, 90, 14, true, true, isHovered ? '#ec4899' : (isSelected ? '#a78bfa' : '#3f4260'));
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(m.label, m.x + 60, 314);
    });

    // 5. Action Buttons: Re-Center, Exit VR & Close Video [y: 380..460]
    // Re-Center Button [x: 60..320]
    const isRecenterHover = (this.currentHoveredButton === 'recenter_btn');
    ctx.fillStyle = isRecenterHover ? '#10b981' : '#059669';
    this.drawRoundedRect(ctx, 60, 380, 260, 80, 14, true, true, isRecenterHover ? '#6ee7b7' : '#10b981');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText('🎯 RE-CENTER', 190, 428);

    // Exit VR Button [x: 340..640]
    const isExitVrHover = (this.currentHoveredButton === 'exit_vr_btn');
    ctx.fillStyle = isExitVrHover ? '#4b5563' : '#374151';
    this.drawRoundedRect(ctx, 340, 380, 300, 80, 14, true, true, isExitVrHover ? '#9ca3af' : '#4b5563');
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🚪 EXIT VR MODE', 490, 428);

    // Close Video Button [x: 660..964]
    const isCloseVidHover = (this.currentHoveredButton === 'close_video_btn');
    ctx.fillStyle = isCloseVidHover ? '#ef4444' : '#dc2626';
    this.drawRoundedRect(ctx, 660, 380, 304, 80, 14, true, true, isCloseVidHover ? '#fca5a5' : '#ef4444');
    ctx.fillStyle = '#ffffff';
    ctx.fillText('✖ CLOSE VIDEO', 812, 428);

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

        // 1. Position Reticle Dot right at the 3D surface intersection point
        reticleDot.position.copy(hit.point);
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
        const y = (1 - uv.y) * 512;
        const btnId = this.getButtonIdAt(x, y);

        if (btnId) {
          newHoveredBtn = btnId;
        }
      } else {
        reticleDot.visible = false;
        if (laser) laser.scale.set(1, 1, 1.0);
      }
    }

    // Trigger short vibration pulse when laser enters a new button
    if (newHoveredBtn && newHoveredBtn !== this.currentHoveredButton) {
      this.currentHoveredButton = newHoveredBtn;
      this.triggerHapticPulse(this.controllers[0], 0.45, 30);
      this.updateVRHUDCanvas();
    } else if (!newHoveredBtn && this.currentHoveredButton) {
      this.currentHoveredButton = null;
      this.updateVRHUDCanvas();
    }
  }

  getButtonIdAt(x, y) {
    if (x >= 934 && x <= 994 && y >= 35 && y <= 77) return 'close_btn';
    if (x >= 60 && x <= 600 && y >= 35 && y <= 77) return 'drag_bar';
    if (x >= 60 && x <= 240 && y >= 260 && y <= 350) return 'play_btn';
    if (x >= 60 && x <= 964 && y >= 140 && y <= 230) return 'seek_bar';
    if (y >= 260 && y <= 350) {
      if (x >= 260 && x <= 380) return '2d';
      if (x >= 400 && x <= 520) return '3d_sbs';
      if (x >= 540 && x <= 660) return '3d_tb';
      if (x >= 680 && x <= 800) return '3d_180_sbs';
      if (x >= 820 && x <= 940) return '3d_360_sbs';
    }
    if (y >= 380 && y <= 460) {
      if (x >= 60 && x <= 320) return 'recenter_btn';
      if (x >= 340 && x <= 640) return 'exit_vr_btn';
      if (x >= 660 && x <= 964) return 'close_video_btn';
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
      const y = (1 - uv.y) * 512;

      // Check if click was on Drag Bar [x: 60..600, y: 35..77]
      if (x >= 60 && x <= 600 && y >= 35 && y <= 77) {
        this.isDragging = true;
        this.activeDragController = controller;
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
      const y = (1 - uv.y) * 512; // Flip Y for canvas space

      // Trigger strong haptic pulse on click
      this.triggerHapticPulse(controller, 0.85, 60);

      // 1. Close Button [✖] Click (x: 934..994, y: 35..77)
      if (x >= 934 && x <= 994 && y >= 35 && y <= 77) {
        this.hideVRHUD();
        return;
      }
      // 2. Drag Bar Click (handled by selectstart/end)
      else if (x >= 60 && x <= 600 && y >= 35 && y <= 77) {
        return;
      }
      // 3. Play / Pause Button Click (x: 60..240, y: 260..350)
      else if (x >= 60 && x <= 240 && y >= 260 && y <= 350) {
        if (this.videoElement) {
          if (this.videoElement.paused) this.videoElement.play();
          else this.videoElement.pause();
        }
      }
      // 4. Progress / Seek Line Click (x: 60..964, y: 140..230)
      else if (x >= 60 && x <= 964 && y >= 140 && y <= 230) {
        if (this.videoElement && this.videoElement.duration) {
          const pct = (x - 60) / 904;
          this.videoElement.currentTime = pct * this.videoElement.duration;
        }
      }
      // 5. 3D Mode Format Selection Buttons (y: 260..350)
      else if (y >= 260 && y <= 350) {
        if (x >= 260 && x <= 380) this.setProjectionMode('2d');
        else if (x >= 400 && x <= 520) this.setProjectionMode('3d_sbs');
        else if (x >= 540 && x <= 660) this.setProjectionMode('3d_tb');
        else if (x >= 680 && x <= 800) this.setProjectionMode('3d_180_sbs');
        else if (x >= 820 && x <= 940) this.setProjectionMode('3d_360_sbs');
      }
      // 6. Re-Center Button Click (x: 60..320, y: 380..460)
      else if (x >= 60 && x <= 320 && y >= 380 && y <= 460) {
        this.recenterVRView();
      }
      // 7. Exit VR Mode Click (x: 340..640, y: 380..460)
      else if (x >= 340 && x <= 640 && y >= 380 && y <= 460) {
        this.exitVR();
      }
      // 8. Close Video Click (x: 660..964, y: 380..460)
      else if (x >= 660 && x <= 964 && y >= 380 && y <= 460) {
        if (this.videoElement) this.videoElement.pause();
        this.exitVR();
        const closeBtn = document.getElementById('btn-close-player');
        if (closeBtn) closeBtn.click();
      }

      this.showVRHUD();
    } else {
      this.showVRHUD();
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

  renderVR(time, frame) {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }

    // Update laser line trimming, reticle dot position, and haptics hover
    this.updateRaycastingAndHover();

    // Handle smooth dragging of HUD panel with active VR controller
    if (this.isDragging && this.activeDragController && this.hudMesh) {
      const controllerPos = new THREE.Vector3();
      const controllerDir = new THREE.Vector3();
      const tempMatrix = new THREE.Matrix4();

      this.activeDragController.getWorldPosition(controllerPos);
      tempMatrix.identity().extractRotation(this.activeDragController.matrixWorld);
      controllerDir.set(0, 0, -1).applyMatrix4(tempMatrix);

      const targetHudPos = controllerPos.clone().add(controllerDir.clone().multiplyScalar(1.5));
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
    this.isDragging = false;
    this.currentHoveredButton = null;
    this.reticleDots.forEach(dot => { dot.visible = false; });
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
