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
      this.renderer.setAnimationLoop((time, frame) => this.renderVR(time, frame));

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

    // VR Controllers
    const controller1 = this.renderer.xr.getController(0);
    controller1.addEventListener('select', () => this.onVRControllerSelect());
    this.scene.add(controller1);

    const controller2 = this.renderer.xr.getController(1);
    controller2.addEventListener('select', () => this.onVRControllerSelect());
    this.scene.add(controller2);
  }

  setProjectionMode(newMode) {
    this.mode3D = newMode;
    if (this.xrSession && this.scene) {
      this.setupStereoVideoScene();
    }
  }

  setupStereoVideoScene() {
    if (!this.videoElement) return;

    // Create Video Texture if not present
    if (!this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.format = THREE.RGBAFormat;
    }

    // Remove old meshes if any
    if (this.leftMesh) this.scene.remove(this.leftMesh);
    if (this.rightMesh) this.scene.remove(this.rightMesh);

    const mode = this.mode3D;

    if (mode === '2d') {
      // 2D Flat Cinema Screen
      const geometry = new THREE.PlaneGeometry(4, 2.25);
      const material = new THREE.MeshBasicMaterial({ map: this.videoTexture, side: THREE.DoubleSide });
      this.leftMesh = new THREE.Mesh(geometry, material);
      this.leftMesh.position.set(0, 1.6, -3);
      this.scene.add(this.leftMesh);
      return;
    }

    // Geometry based on 3D layout (Flat Screen, 180 Dome, 360 Sphere)
    let geometryLeft, geometryRight;

    if (mode === '3d_180_sbs') {
      // VR 180 Hemisphere
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, Math.PI / 2, Math.PI, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryRight = geometryLeft.clone();
    } else if (mode === '3d_360_sbs') {
      // VR 360 Sphere
      geometryLeft = new THREE.SphereGeometry(10, 60, 40, 0, Math.PI * 2, 0, Math.PI);
      geometryLeft.scale(-1, 1, 1);
      geometryRight = geometryLeft.clone();
    } else {
      // Flat / Curved Cinema Screen for SBS or Top-Bottom
      geometryLeft = new THREE.PlaneGeometry(4, 2.25, 32, 16);
      geometryRight = new THREE.PlaneGeometry(4, 2.25, 32, 16);
    }

    // Create left & right materials with texture offsets
    const textureLeft = this.videoTexture.clone();
    const textureRight = this.videoTexture.clone();
    textureLeft.needsUpdate = true;
    textureRight.needsUpdate = true;

    if (mode === '3d_sbs' || mode === '3d_180_sbs' || mode === '3d_360_sbs') {
      // Left eye: left half [0..0.5]
      textureLeft.offset.set(0, 0);
      textureLeft.repeat.set(0.5, 1.0);

      // Right eye: right half [0.5..1.0]
      textureRight.offset.set(0.5, 0);
      textureRight.repeat.set(0.5, 1.0);
    } else if (mode === '3d_tb') {
      // Top-Bottom (Over-Under)
      // Left eye: top half [0.5..1.0]
      textureLeft.offset.set(0, 0.5);
      textureLeft.repeat.set(1.0, 0.5);

      // Right eye: bottom half [0..0.5]
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

    // WebXR Eye Separation via Camera Layers
    // Layer 1 = Left Eye, Layer 2 = Right Eye
    this.leftMesh.layers.set(1);
    this.rightMesh.layers.set(2);

    this.scene.add(this.leftMesh);
    this.scene.add(this.rightMesh);
  }

  onVRControllerSelect() {
    if (this.videoElement) {
      if (this.videoElement.paused) {
        this.videoElement.play();
      } else {
        this.videoElement.pause();
      }
    }
  }

  renderVR(time, frame) {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
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
  }

  exitVR() {
    if (this.xrSession) {
      this.xrSession.end();
    }
  }
}

// Global Singleton for WebXR Player
window.xrPlayer = new XRVideoPlayer();
